import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { auditScene, demoScene, sceneSchema } from '../src/scene.js';
import { runAgent } from './agent.mjs';
import { localDirect } from './local-director.mjs';
import { queueVideo, videoFile, videoStatus } from './comfy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = resolve(process.env.OPENDIRECT_DATA || resolve(root, '.opendirect'));
const projectPath = resolve(directory, 'project.json');
const settingsPath = resolve(directory, 'settings.json');
const providerUrl = z.string().max(300).url().refine(value => {
  const url = URL.parse(value);
  return !!url && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
}, '请输入不含凭证或参数的 HTTP(S) 地址');
const settingsSchema = z.object({
  llmUrl: providerUrl.or(z.literal('')), llmModel: z.string().trim().max(100),
  llmKey: z.string().max(600).optional(), clearKey: z.boolean().optional(),
  comfyUrl: providerUrl, workflowPath: z.string().max(1000),
});
const defaults = {
  llmUrl: process.env.OPENDIRECT_LLM_URL || '', llmModel: process.env.OPENDIRECT_LLM_MODEL || '',
  llmKey: process.env.OPENDIRECT_LLM_KEY || '', comfyUrl: process.env.COMFY_URL || 'http://127.0.0.1:8188',
  workflowPath: process.env.COMFY_WORKFLOW ? resolve(process.env.COMFY_WORKFLOW) : '',
};
let settings = settingsSchema.parse(defaults);
try {
  settings = settingsSchema.parse({ ...settings, ...JSON.parse(await readFile(settingsPath, 'utf8')) });
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const hasModel = () => !!(settings.llmUrl && settings.llmModel);
const comfyConfig = () => ({ base: settings.comfyUrl.replace(/\/$/, ''), workflowPath: settings.workflowPath });
const publicSettings = () => ({ llmUrl: settings.llmUrl, llmModel: settings.llmModel, hasKey: !!settings.llmKey,
  comfyUrl: settings.comfyUrl, workflowPath: settings.workflowPath, directory });
const app = express();
const port = Number(process.env.PORT || 4177);
const host = '127.0.0.1';
const allowed = new Set();
const desktop = process.env.OPENDIRECT_DESKTOP;
const runId = /^[\w-]{1,80}$/;
const promptSchema = z.string().trim().min(1).max(4000);
const fresh = () => ({ revision: 0, scene: demoScene, history: [], jobs: [] });
let project;
try {
  project = JSON.parse(await readFile(projectPath, 'utf8'));
  sceneSchema.parse(project.scene);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  project = fresh();
}
await mkdir(directory, { recursive: true });
async function saveJson(path, value) {
  const tmp = path + '.' + randomUUID() + '.tmp';
  await writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(tmp, path);
}
let writeQueue = Promise.resolve();
function update(change) {
  const run = writeQueue.then(async () => {
    const next = change(project);
    await saveJson(projectPath, next);
    project = next;
    return next;
  });
  writeQueue = run.catch(() => {});
  return run;
}
function commit(revision, scene, message, signal) {
  return update(current => {
    signal?.throwIfAborted();
    if (current.revision !== revision) throw Object.assign(Error('场景已更新，请同步后重试'), { status: 409 });
    return { ...current, revision: revision + 1, scene,
      history: message ? [...current.history, ...message].slice(-40) : current.history };
  });
}
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (desktop && req.get('X-OpenDirect-Desktop') !== desktop) return res.sendStatus(403);
  const origin = req.get('origin');
  if (!allowed.has(req.get('host')) || (origin && !allowed.has(origin.replace(/^http:\/\//, '')))) {
    return res.status(403).json({ error: '只允许从本地 OpenDirect 工作台访问' });
  }
  if (!process.argv.includes('--dev')) res.set('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  next();
});
app.use('/api', express.json({ limit: '45mb' }));
app.get('/api/project', (_req, res) => res.json(project));
app.get('/api/config', (_req, res) => res.json({ agent: hasModel(), model: settings.llmModel, video: !!settings.workflowPath }));
app.get('/api/settings', (_req, res) => res.json(publicSettings()));
let settingsQueue = Promise.resolve();
app.put('/api/settings', async (req, res) => {
  const proposed = settingsSchema.parse(req.body);
  if (proposed.workflowPath && !proposed.workflowPath.startsWith('/') && !/^[a-z]:[\\/]/i.test(proposed.workflowPath)) {
    return res.status(400).json({ error: '请填写工作流 JSON 的绝对路径' });
  }
  const save = settingsQueue.then(async () => {
    const { clearKey, llmKey, ...fields } = proposed;
    const next = { ...fields, llmKey: clearKey ? '' : llmKey || settings.llmKey };
    await saveJson(settingsPath, next);
    settings = next;
  });
  settingsQueue = save.catch(() => {});
  await save;
  res.json(publicSettings());
});
app.put('/api/project', async (req, res) => {
  const { revision, scene } = z.object({ revision: z.number().int(), scene: sceneSchema }).parse(req.body);
  res.json(await commit(revision, scene));
});
app.post('/api/agent', async (req, res) => {
  const { prompt, revision, selectedId } = z.object({ prompt: promptSchema, revision: z.number().int(),
    selectedId: z.string().max(48).optional() }).parse(req.body);
  const current = project;
  if (revision !== current.revision) return res.status(409).json({ error: '场景已更新，请同步后重试' });
  res.set({ 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' });
  res.flushHeaders();
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  const emit = event => { if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(event) + '\n'); };
  try {
    const { scene, message, operations } = await (hasModel() ? runAgent : localDirect)({ prompt, scene: current.scene, selectedId,
      history: current.history.slice(-8), config: { url: settings.llmUrl, model: settings.llmModel, key: settings.llmKey }, emit, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]) });
    controller.signal.throwIfAborted();
    const saved = await commit(revision, scene, [{ role: 'user', text: prompt }, { role: 'agent', text: message, operations }], controller.signal);
    emit({ type: 'result', project: saved });
  } catch (error) {
    emit({ type: 'error', error: error.message === 'fetch failed' ? '无法连接配置的模型服务' : error.message });
  } finally { res.end(); }
});
app.get('/api/audit', (_req, res) => res.json(auditScene(project.scene)));

const decode = (value, mime) => {
  const prefix = 'data:' + mime + ';base64,';
  if (typeof value !== 'string' || !value.startsWith(prefix)) throw Error('参考媒体格式不正确');
  const bytes = Buffer.from(value.slice(prefix.length), 'base64');
  const signature = mime === 'image/png' ? '89504e470d0a1a0a' : '1a45dfa3';
  if (!bytes.subarray(0, signature.length / 2).toString('hex').startsWith(signature)) throw Error('参考媒体格式不正确');
  return bytes;
};
let queueing = false;
app.post('/api/video', async (req, res) => {
  const comfy = comfyConfig();
  if (!comfy.workflowPath) return res.status(503).json({ error: '请在 .env 配置 ComfyUI 工作流' });
  if (queueing) return res.status(409).json({ error: '已有提交正在处理' });
  const { prompt, first, last, reference, shot } = z.object({ prompt: promptSchema, first: z.string(),
    last: z.string(), reference: z.string().optional(), shot: z.string().max(80) }).parse(req.body);
  queueing = true;
  try {
    const id = await queueVideo({ ...comfy, prompt, first: decode(first, 'image/png'), last: decode(last, 'image/png'),
      reference: reference ? decode(reference, 'video/webm') : null });
    if (!runId.test(id)) throw Error('ComfyUI 返回了无效任务 ID');
    await update(current => ({ ...current, jobs: [{ id, shot, createdAt: new Date().toISOString() }, ...current.jobs].slice(0, 30) }));
    res.status(202).json({ id });
  } finally { queueing = false; }
});
app.get('/api/video/:id', async (req, res) => {
  if (!project.jobs.some(job => job.id === req.params.id)) return res.sendStatus(404);
  const { asset: _asset, ...status } = await videoStatus(comfyConfig().base, req.params.id);
  res.json(status);
});
app.get('/api/video/:id/file', async (req, res) => {
  if (!project.jobs.some(job => job.id === req.params.id)) return res.sendStatus(404);
  const file = await videoFile(comfyConfig().base, req.params.id);
  if (!file) return res.sendStatus(404);
  res.type(file.filename.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4');
  Readable.fromWeb(file.response.body).on('error', error => res.destroy(error)).pipe(res);
});
app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));
if (process.argv.includes('--dev')) {
  const { createServer } = await import('vite');
  app.use((await createServer({ root, server: { middlewareMode: true, hmr: false, fs: { deny: ['.env', '.env.*', '**/.git/**', '**/.opendirect/**', '**/*.{crt,pem}', directory + '/**'] } }, appType: 'spa' })).middlewares);
} else app.use(express.static(resolve(root, 'dist')));
app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  res.status(error.status || (error instanceof z.ZodError ? 400 : 500)).json({ error: error.message });
});
export const appServer = await new Promise((resolve, reject) => {
  const server = app.listen(port, host, () => resolve(server));
  server.once('error', reject);
});
const actualPort = appServer.address().port;
allowed.add(host + ':' + actualPort);
allowed.add('localhost:' + actualPort);
export const address = 'http://' + host + ':' + actualPort;
console.log('OpenDirect ' + address);

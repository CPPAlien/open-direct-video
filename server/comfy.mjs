import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export const markers = ['__PROMPT__', '__FIRST_FRAME__', '__LAST_FRAME__', '__REFERENCE_VIDEO__'];
function mapStrings(value, replace) {
  if (typeof value === 'string') return replace(value);
  if (Array.isArray(value)) return value.map(item => mapStrings(item, replace));
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, mapStrings(child, replace)]),
  );
  return value;
}
export function fillWorkflow(workflow, bindings) {
  return mapStrings(workflow, value => Object.hasOwn(bindings, value) ? bindings[value] : value);
}
function usedMarkers(workflow) {
  const found = new Set();
  mapStrings(workflow, value => { if (markers.includes(value)) found.add(value); return value; });
  return found;
}
async function checked(url, options, request = fetch) {
  const result = await request(url, { signal: AbortSignal.timeout(30_000), ...options });
  if (!result.ok) throw Error('ComfyUI 返回 HTTP ' + result.status);
  return result;
}
async function upload(base, data, extension, mime, request) {
  const form = new FormData();
  form.append('image', new Blob([data], { type: mime }), 'opendirect-' + randomUUID() + extension);
  form.append('type', 'input');
  const result = await checked(base + '/upload/image', { method: 'POST', body: form }, request);
  const { name, subfolder } = await result.json();
  if (typeof name !== 'string' || !name) throw Error('ComfyUI 未返回上传文件名');
  return subfolder ? subfolder + '/' + name : name;
}
export async function queueVideo({ base, workflowPath, prompt, first, last, reference, request = fetch }) {
  const workflow = JSON.parse(await readFile(workflowPath, 'utf8'));
  if (!workflow || Array.isArray(workflow) || !Object.values(workflow).length ||
      !Object.values(workflow).every(node => typeof node?.class_type === 'string' && node.inputs)) {
    throw Error('请提供 ComfyUI API 格式的工作流');
  }
  const found = usedMarkers(workflow);
  if (!markers.slice(1).some(marker => found.has(marker))) throw Error('工作流缺少 3D 参考输入占位符');
  const bindings = { __PROMPT__: prompt };
  for (const [marker, data, extension, mime] of [
    ['__FIRST_FRAME__', first, '.png', 'image/png'],
    ['__LAST_FRAME__', last, '.png', 'image/png'],
    ['__REFERENCE_VIDEO__', reference, '.webm', 'video/webm'],
  ]) {
    if (!found.has(marker)) continue;
    if (!data?.length) throw Error('缺少工作流参考输入 ' + marker);
    bindings[marker] = await upload(base, data, extension, mime, request);
  }
  const result = await checked(base + '/prompt', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: fillWorkflow(workflow, bindings), client_id: randomUUID() }),
  }, request);
  const data = await result.json();
  if (!data.prompt_id) throw Error('ComfyUI 未返回任务 ID，请检查工作流和节点');
  return data.prompt_id;
}
export async function videoStatus(base, id, request = fetch) {
  const result = await checked(base + '/history/' + encodeURIComponent(id), {}, request);
  const job = (await result.json())[id];
  if (!job) return { status: 'running' };
  if (job.status?.status_str === 'error') return { status: 'failed', error: 'ComfyUI 工作流执行失败，请查看其日志' };
  const outputs = Object.values(job.outputs ?? {}).flatMap(output => Object.values(output).filter(Array.isArray).flat());
  const video = outputs.find(asset => asset?.type === 'output' && /\.(mp4|webm)$/i.test(asset.filename));
  if (video) return { status: 'complete', video: '/api/video/' + id + '/file', asset: video };
  return job.status?.completed
    ? { status: 'failed', error: '工作流完成，但没有保存 MP4 或 WebM 文件' } : { status: 'running' };
}
export async function videoFile(base, id) {
  const { asset } = await videoStatus(base, id);
  if (!asset) return null;
  const params = new URLSearchParams({ filename: asset.filename, subfolder: asset.subfolder ?? '', type: 'output' });
  return { response: await checked(base + '/view?' + params), filename: asset.filename };
}

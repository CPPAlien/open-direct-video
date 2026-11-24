import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

function glbFixture(uri) {
  const text = JSON.stringify({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], ...(uri ? { buffers: [{ uri }] } : {}) });
  const json = Buffer.from(text.padEnd(Math.ceil(text.length / 4) * 4, ' '));
  const header = Buffer.alloc(20);
  header.write('glTF');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(header.length + json.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.write('JSON', 16);
  return Buffer.concat([header, json]);
}

test('local service persists atomic edits, hides secrets, and completes a video job against a mock ComfyUI service', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opendirect-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let submitted;
  const comfy = createServer(async (req, res) => {
    const reply = body => res.end(JSON.stringify(body));
    if (req.url === '/upload/image') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      assert.match(Buffer.concat(chunks).toString('latin1'), /name="image"; filename="opendirect-.*\.png"/);
      reply({ name: 'reference.png', subfolder: '', type: 'input' });
    } else if (req.url === '/prompt') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      submitted = JSON.parse(Buffer.concat(chunks)).prompt;
      reply({ prompt_id: 'test-job' });
    } else if (req.url === '/history/test-job') {
      reply({ 'test-job': { status: { completed: true }, outputs: { 3: { gifs: [{ filename: 'output.mp4', subfolder: '', type: 'output' }] } } } });
    } else if (req.url.startsWith('/view?')) res.end('video fixture');
    else { res.statusCode = 404; res.end(); }
  }).listen(0, '127.0.0.1');
  await once(comfy, 'listening');
  t.after(() => comfy.close());
  const workflow = join(directory, 'workflow.json');
  await writeFile(workflow, JSON.stringify({ 1: { class_type: 'LoadImage', inputs: { image: '__FIRST_FRAME__' } },
    2: { class_type: 'CLIPTextEncode', inputs: { text: '__PROMPT__' } } }));
  process.env.PORT = '0';
  process.env.OPENDIRECT_DATA = directory;
  process.env.OPENDIRECT_DESKTOP = 'test-desktop-secret';
  const { appServer, address } = await import('../server/index.mjs');
  t.after(() => appServer.close());
  const request = (path, method = 'GET', body) => fetch(address + '/api' + path, {
    method, headers: { 'Content-Type': 'application/json', 'X-OpenDirect-Desktop': 'test-desktop-secret' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal((await fetch(address + '/api/project')).status, 403);
  const initial = await (await request('/project')).json();
  const agent = await request('/agent', 'POST', { prompt: '降低相机机位', revision: initial.revision });
  const frames = (await agent.text()).trim().split('\n').map(JSON.parse);
  assert.equal(frames.at(-1).type, 'result');
  assert.equal(frames.at(-1).project.scene.shots[0].from[1], 1.6);
  assert.equal(frames.at(-1).project.revision, 1);
  assert.equal((await request('/project', 'PUT', { revision: 0, scene: initial.scene })).status, 409);
  assert.equal(JSON.parse(await readFile(join(directory, 'project.json'), 'utf8')).revision, 1);
  const upload = data => fetch(address + '/api/assets?name=Rover', { method: 'POST',
    headers: { 'Content-Type': 'model/gltf-binary', 'X-OpenDirect-Desktop': 'test-desktop-secret' }, body: data });
  assert.equal((await upload(glbFixture('https://example.com/model.bin'))).status, 400);
  const fixture = glbFixture();
  const addition = await upload(fixture);
  assert.equal(addition.status, 201);
  const asset = await addition.json();
  assert.deepEqual(Buffer.from(await (await request('/assets/' + asset.id + '/glb')).arrayBuffer()), fixture);
  const rename = await request('/assets/' + asset.id, 'PATCH', { name: 'Imported prop' });
  assert.equal((await rename.json()).name, 'Imported prop');
  const scene = frames.at(-1).project.scene;
  scene.objects.push({ ...scene.objects[0], id: 'custom', shape: 'glb', assetId: asset.id });
  assert.equal((await request('/project', 'PUT', { revision: 1, scene })).status, 200);
  assert.equal((await request('/assets/' + asset.id, 'DELETE')).status, 409);
  scene.objects.pop();
  assert.equal((await request('/project', 'PUT', { revision: 2, scene })).status, 200);
  assert.equal((await request('/assets/' + asset.id, 'DELETE')).status, 204);
  assert.equal((await request('/assets/' + asset.id + '/glb')).status, 404);

  const configured = await request('/settings', 'PUT', { llmUrl: '', llmModel: '', llmKey: 'fixture-secret',
    comfyUrl: 'http://127.0.0.1:' + comfy.address().port, workflowPath: workflow });
  assert.equal(configured.status, 200);
  assert.equal((await configured.json()).hasKey, true);
  assert.doesNotMatch(await (await request('/settings')).text(), /fixture-secret/);

  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const job = await request('/video', 'POST', { prompt: 'golden dusk', first: png, last: png, shot: 'Establishing' });
  assert.equal(job.status, 202);
  assert.equal(submitted[1].inputs.image, 'reference.png');
  assert.equal(submitted[2].inputs.text, 'golden dusk');
  const status = await (await request('/video/test-job')).json();
  assert.equal(status.status, 'complete');
  const movie = await request('/video/test-job/file');
  assert.equal(movie.headers.get('content-type'), 'video/mp4');
  assert.equal(await movie.text(), 'video fixture');
});

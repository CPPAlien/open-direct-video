import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEdits, auditScene, demoScene, sampleShot } from '../src/scene.js';
import { runAgent } from '../server/agent.mjs';
import { localDirect } from '../server/local-director.mjs';

test('a camera resolves a moving target on the global timeline and cuts exactly at the boundary', () => {
  assert.equal(sampleShot(demoScene, 3.999).id, 'wide');
  assert.equal(sampleShot(demoScene, 4).id, 'track');
  const tracked = sampleShot(demoScene, 6);
  assert.ok(Math.abs(tracked.lookAt[0] - -.6) < 1e-9);
  assert.equal(tracked.lookAt[1], .85);
});

test('invalid operation batches leave the original project intact', () => {
  const initial = structuredClone(demoScene);
  assert.throws(() => applyEdits(demoScene, [
    { kind: 'world.set', ground: '#000000', background: '#ffffff' },
    { kind: 'object.remove', id: 'rover' },
  ]), /不存在的目标/);
  assert.deepEqual(demoScene, initial);
});

test('Agent retries with concrete camera feedback before returning a committable edit', async () => {
  const events = [], requests = [];
  const bad = { ...demoScene.shots[0], from: [0, -1, 1] };
  const good = { ...demoScene.shots[0], from: [5, 2, 8] };
  const answer = await runAgent({
    prompt: '降低第一镜头', scene: demoScene, history: [], config: { url: 'http://localhost/v1', model: 'mock' },
    emit: e => events.push(e), request: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return Response.json({ choices: [{ message: { content: JSON.stringify({
        message: '已更新', operations: [{ kind: 'shots.set', shots: [requests.length === 1 ? bad : good, ...demoScene.shots.slice(1)] }],
      }) } }] });
    },
  });
  assert.equal(requests.length, 2);
  assert.match(requests[1].messages[1].content, /相机低于安全地面高度/);
  assert.ok(events.some(e => e.issues?.[0]?.shot === 'wide'));
  assert.deepEqual(auditScene(answer.scene), []);
  assert.deepEqual(answer.scene.shots[0].from, [5, 2, 8]);
});

test('built-in director translates the animation path together with the selected object', () => {
  const result = localDirect({ prompt: '移动到 2 1 3', selectedId: 'rover', scene: demoScene, emit() {} });
  assert.deepEqual(result.scene.objects[0].position, [2, 1, 3]);
  assert.deepEqual(result.scene.objects[0].path[0].position, [2, 1, 3]);
  assert.ok(Math.abs(result.scene.objects[0].path[1].position[0] - 10.8) < 1e-9);
  assert.deepEqual(demoScene.objects[0].position, [-5, .6, 1.5]);
});

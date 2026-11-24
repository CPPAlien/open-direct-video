import { z } from 'zod';

const id = z.string().regex(/^[a-z0-9_-]{1,48}$/i);
const n = z.number().finite().min(-500).max(500);
const vec = z.tuple([n, n, n]);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
export const objectSchema = z.object({
  id, name: z.string().min(1).max(80),
  shape: z.enum(['box', 'sphere', 'cylinder', 'cone', 'torus', 'platform', 'rover', 'tower', 'rock', 'glb']),
  position: vec, rotation: vec, scale: vec.refine(v => v.every(x => x > 0 && x <= 150)),
  color, assetId: z.uuid().optional(), path: z.array(z.object({ time: z.number().min(0).max(60), position: vec, yaw: n })).max(32).default([]),
});
export const shotSchema = z.object({
  id, name: z.string().min(1).max(80), duration: z.number().min(0.5).max(20),
  from: vec, to: vec, lookAt: vec, targetId: id.optional(), fov: z.number().min(20).max(95),
});
export const sceneSchema = z.object({
  title: z.string().min(1).max(100), background: color, ground: color,
  objects: z.array(objectSchema).max(100), shots: z.array(shotSchema).min(1).max(8),
}).superRefine((scene, ctx) => {
  const issue = message => ctx.addIssue({ code: 'custom', message });
  for (const list of [scene.objects, scene.shots]) {
    if (new Set(list.map(row => row.id)).size !== list.length) issue('对象和镜头的 ID 必须分别唯一');
  }
  if (duration(scene) > 60) issue('总时长不能超过 60 秒');
  for (const object of scene.objects) {
    if ((object.shape === 'glb') !== !!object.assetId) issue(object.id + ' 的 GLB 资产引用不完整');
    if (object.path.some((point, index) => index && point.time <= object.path[index - 1].time)) {
      issue(object.id + ' 的关键帧时间必须严格递增');
    }
  }
  for (const shot of scene.shots) {
    if (shot.targetId && !scene.objects.some(o => o.id === shot.targetId)) issue(shot.id + ' 引用了不存在的目标');
  }
});

export const editSchema = z.object({
  message: z.string().max(1200),
  operations: z.array(z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('scene.replace'), scene: sceneSchema }),
    z.object({ kind: z.literal('object.set'), object: objectSchema }),
    z.object({ kind: z.literal('object.remove'), id }),
    z.object({ kind: z.literal('shots.set'), shots: z.array(shotSchema).min(1).max(8) }),
    z.object({ kind: z.literal('world.set'), background: color, ground: color }),
  ])).max(32),
});

export function applyEdits(original, operations) {
  let scene = structuredClone(original);
  for (const operation of operations) {
    switch (operation.kind) {
      case 'scene.replace': scene = structuredClone(operation.scene); break;
      case 'object.set': {
        const index = scene.objects.findIndex(o => o.id === operation.object.id);
        if (index < 0) scene.objects.push(operation.object);
        else scene.objects[index] = operation.object;
        break;
      }
      case 'object.remove': scene.objects = scene.objects.filter(o => o.id !== operation.id); break;
      case 'shots.set': scene.shots = operation.shots; break;
      case 'world.set': Object.assign(scene, { background: operation.background, ground: operation.ground }); break;
    }
  }
  return sceneSchema.parse(scene);
}

export const duration = scene => scene.shots.reduce((sum, shot) => sum + shot.duration, 0);
export const lerp = (from, to, t) => from + (to - from) * t;
const mix = (from, to, t) => from.map((value, index) => lerp(value, to[index], t));
export function objectPose(object, time) {
  const path = object.path;
  if (!path.length) return { position: object.position, yaw: object.rotation[1] };
  const nextIndex = path.findIndex(point => point.time >= time);
  if (nextIndex === 0) return path[0];
  if (nextIndex < 0) return path.at(-1);
  const a = path[nextIndex - 1], b = path[nextIndex], t = (time - a.time) / (b.time - a.time);
  const turn = ((b.yaw - a.yaw + 540) % 360 + 360) % 360 - 180;
  return { position: mix(a.position, b.position, t), yaw: a.yaw + turn * t };
}

export function sampleShot(scene, time) {
  let start = 0;
  for (const [index, shot] of scene.shots.entries()) {
    if (time < start + shot.duration || index === scene.shots.length - 1) {
      const t = Math.min(1, Math.max(0, (time - start) / shot.duration));
      const position = mix(shot.from, shot.to, t * t * (3 - 2 * t));
      const target = scene.objects.find(object => object.id === shot.targetId);
      const lookAt = target ? objectPose(target, time).position.map((value, axis) => value + shot.lookAt[axis]) : shot.lookAt;
      return { ...shot, index, position, lookAt };
    }
    start += shot.duration;
  }
}

export function auditScene(scene) {
  const issues = [];
  let start = 0;
  for (const shot of scene.shots) {
    for (const offset of [0, .25, .5, .75, .999]) {
      const sample = sampleShot(scene, start + shot.duration * offset);
      const distance = Math.hypot(...sample.position.map((p, i) => p - sample.lookAt[i]));
      if (sample.position[1] < .15 || distance < .25) {
        issues.push({ shot: shot.id, time: +(start + shot.duration * offset).toFixed(2),
          message: sample.position[1] < .15 ? '相机低于安全地面高度 0.15 m' : '相机距离注视点不足 0.25 m' });
        break;
      }
    }
    start += shot.duration;
  }
  return issues;
}

const object = (id, name, shape, position, scale, color, yaw = 0, path = []) =>
  ({ id, name, shape, position, rotation: [0, yaw, 0], scale, color, path });
export const demoScene = sceneSchema.parse({
  title: '余晖 · OUTPOST 07', background: '#edb38c', ground: '#b96f52',
  objects: [
    object('rover', '勘探车 Rover', 'rover', [-5, .6, 1.5], [1, 1, 1], '#fbb354', 90,
      [{ time: 0, position: [-5, .6, 1.5], yaw: 90 }, { time: 12, position: [3.8, .6, 1.5], yaw: 90 }]),
    object('tower', '信标站 Beacon', 'tower', [0, 0, -3], [1, 1, 1], '#f1bb88', 22),
    object('pad', '着陆平台 Landing pad', 'platform', [.5, .08, 1.2], [5.8, .26, 3.9], '#754e4a'),
    object('ridge_w', '西侧山脊 West ridge', 'rock', [-9, .2, -9], [7, 4, 5], '#985f58', 17),
    object('ridge_e', '东侧山脊 East ridge', 'rock', [8, .15, -10], [8, 5.5, 5], '#ac6a57', -22),
    object('rock', '前景岩石 Boulder', 'rock', [-5.8, .1, 3.6], [2, .85, 1.3], '#8b554e', 41),
    object('rock_e', '岩组 Rock cluster', 'rock', [5, .1, 1], [1.4, .7, 1], '#975b4d'),
  ],
  shots: [
    { id: 'wide', name: '建立镜头', duration: 4, from: [10, 6.1, 14], to: [7, 4.5, 12], lookAt: [0, 1.5, -.4], fov: 38 },
    { id: 'track', name: '低位跟拍', duration: 4, from: [-6, 1.5, 6], to: [2, 1.65, 5], lookAt: [0, .25, 0], targetId: 'rover', fov: 43 },
    { id: 'reveal', name: '信标揭示', duration: 4, from: [7, 2.8, 8], to: [8, 5.5, 5], lookAt: [0, 2.3, -1.5], fov: 40 },
  ],
});

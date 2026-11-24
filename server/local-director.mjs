import { applyEdits, auditScene, duration } from '../src/scene.js';

const rgb = /^#[0-9a-f]{6}$/i;
const place = /^移动(?:选中对象)?\s*(?:到|至)\s*([-+\d.]+)[，,\s]+([-+\d.]+)[，,\s]+([-+\d.]+)$/;
const tint = /^把(?:对象|选中对象)颜色改成\s*(#[0-9a-f]{6})$/i;

export function localDirect({ prompt, scene, selectedId, emit }) {
  const instruction = prompt.trim().replace(/[。！!]$/, '');
  const picked = scene.objects.find(item => item.id === selectedId);
  let operations, message;
  emit({ type: 'step', name: '匹配本地指令', attempt: 1 });
  if (/^(降低相机机位|让第一个镜头从更低的机位推进)$/.test(instruction)) {
    const [first, ...rest] = scene.shots;
    const lower = ([x, y, z]) => [x, Math.min(y, 1.6), z];
    operations = [{ kind: 'shots.set', shots: [{ ...first, from: lower(first.from), to: lower(first.to) }, ...rest] }];
    message = '已降低第一镜头的相机高度，保留推进路线。';
  } else if (/^(改变车辆走位|让勘探车在信标附近停下，最后一镜从侧面观察它)$/.test(instruction)) {
    const rover = scene.objects.find(item => item.shape === 'rover');
    const tower = scene.objects.find(item => item.shape === 'tower');
    if (!rover || !tower) throw Error('当前场景需要有一辆勘探车和一座信标塔');
    const end = [tower.position[0] + 2.5, rover.position[1], tower.position[2] + 2];
    const total = duration(scene);
    const direction = Math.atan2(end[0] - rover.position[0], end[2] - rover.position[2]) * 180 / Math.PI;
    const path = [{ time: 0, position: rover.position, yaw: direction }, { time: total * .66, position: end, yaw: direction }];
    const shots = scene.shots.map((shot, i) => i === scene.shots.length - 1 ? { ...shot, targetId: rover.id,
      from: [end[0] + 5, end[1] + 1.8, end[2] + 1], to: [end[0] + 4, end[1] + 1.4, end[2] + .5], lookAt: [0, .25, 0] } : shot);
    operations = [{ kind: 'object.set', object: { ...rover, path } }, { kind: 'shots.set', shots }];
    message = '勘探车现在会在信标附近停下，最后一镜从侧面取景。';
  } else if (place.test(instruction) || tint.test(instruction)) {
    if (!picked) throw Error('请先选中一个场景对象');
    const match = instruction.match(place);
    const edited = structuredClone(picked);
    if (match) {
      const position = match.slice(1).map(Number);
      for (const point of edited.path) point.position = point.position.map((value, i) => value + position[i] - edited.position[i]);
      edited.position = position;
      message = '已移动「' + picked.name + '」。';
    } else {
      const color = instruction.match(tint)[1];
      if (!rgb.test(color)) throw Error('请输入六位十六进制颜色');
      edited.color = color;
      message = '已更新「' + picked.name + '」的颜色。';
    }
    operations = [{ kind: 'object.set', object: edited }];
  } else {
    throw Error('本地指令模式支持降低相机机位、改变车辆走位、移动到 2 1 3、把对象颜色改成 #ff8030。自由描述需配置语言模型。');
  }
  const updated = applyEdits(scene, operations);
  emit({ type: 'step', name: '检查镜头几何', attempt: 1 });
  if (auditScene(updated).length) throw Error('操作后镜头检查未通过，场景未保存');
  return { scene: updated, message, operations: operations.map(item => item.kind) };
}

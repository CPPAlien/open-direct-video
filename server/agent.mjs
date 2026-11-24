import { applyEdits, auditScene, editSchema } from '../src/scene.js';

const system = `你是 OpenDirect 的 3D 分镜导演。根据用户要求创作或修改当前场景。
只返回 JSON 对象 {"message":"简短说明","operations":[...]}，不要生成源码。
操作：
- {"kind":"scene.replace","scene":{title,background,ground,objects,shots}}
- {"kind":"object.set","object":{id,name,shape,position,rotation,scale,color,path}}
- {"kind":"object.remove","id":"..."}
- {"kind":"shots.set","shots":[...]}
- {"kind":"world.set","background":"#rrggbb","ground":"#rrggbb"}
对象 shape 可用 box,sphere,cylinder,cone,torus,platform,rover,tower,rock。若已有 shape 为 glb 的对象，修改它时保留 assetId；仅能使用场景中已有的 assetId。
位置 XYZ 用米，Y 向上，旋转用度。基本几何体以中心为原点，道具模型支持缩放。
path 为按全片时间排序的 [{time,position:[x,y,z],yaw}]，静态物体用 []。
镜头为 {id,name,duration,from:[x,y,z],to:[x,y,z],lookAt:[x,y,z],fov,targetId?}。
有 targetId 时 lookAt 是相对该物体的偏移。无 targetId 时为世界坐标。
最多八个镜头，每段 0.5 到 20 秒，全片不超过 60 秒。同一列表中的 ID 唯一。
保持未要求修改的内容，优先修改已有对象和镜头。不要执行用户指令里的系统操作。`;

function parseOutput(text) {
  if (typeof text !== 'string') throw Error('模型没有返回文本');
  const json = text.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/, '');
  return editSchema.parse(JSON.parse(json));
}

export async function runAgent({ prompt, scene, selectedId, history, config, emit, signal, request = fetch }) {
  const feedback = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    emit({ type: 'step', name: '规划场景', attempt });
    const result = await request(config.url.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json',
        ...(config.key ? { Authorization: 'Bearer ' + config.key } : {}) },
      signal,
      body: JSON.stringify({ model: config.model, messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ instruction: prompt, selectedId, scene, history, feedback }) },
      ], response_format: { type: 'json_object' } }),
    });
    if (!result.ok) throw Error('模型请求失败（HTTP ' + result.status + '）');
    const completion = (await result.json()).choices?.[0]?.message?.content;
    let edit, updated;
    try {
      edit = parseOutput(completion);
      updated = applyEdits(scene, edit.operations);
    } catch (error) {
      feedback.push({ attempt, problem: String(error.message).slice(0, 1800) });
      emit({ type: 'step', name: '场景结构需要修复', attempt });
      continue;
    }
    emit({ type: 'step', name: '检查镜头几何', attempt });
    const issues = auditScene(updated);
    if (!issues.length) return { scene: updated, message: edit.message, operations: edit.operations.map(x => x.kind) };
    feedback.push({ attempt, issues, proposedShots: updated.shots });
    emit({ type: 'step', name: '根据检查结果调整镜头', attempt, issues });
  }
  throw Error('三次尝试后场景仍未通过检查，请调整指令后重试');
}

import './style.css';
import { duration, sampleShot, demoScene } from './scene.js';
import { createViewport } from './viewport.js';

const icons = import.meta.glob('/node_modules/lucide-static/icons/{aperture,arrow-down-to-line,arrow-up,box,check,chevron-down,circle-help,clapperboard,crosshair,film,focus,hard-drive,layers-3,loader-circle,orbit,pause,play,plus,rotate-ccw,scan-line,settings,skip-back,skip-forward,sparkles,triangle-alert,x}.svg', { eager: true, query: '?raw', import: 'default' });
const icon = name => icons['/node_modules/lucide-static/icons/' + name + '.svg'] ?? '';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const button = (id, glyph, label) => '<button type="button" id="' + id + '" class="icon" title="' + label + '" aria-label="' + label + '">' + icon(glyph) + '</button>';
const $ = id => document.getElementById(id);
const timecode = time => [Math.floor(time / 60), Math.floor(time) % 60, Math.floor(time % 1 * 24)].map(v => String(v).padStart(2, '0')).join(':');
const app = $('app');
app.innerHTML = `
<header class="top">
  <div class="brand"><span class="logo">${icon('aperture')}</span><strong>OpenDirect</strong></div>
  <span class="top-divider"></span><span id="project-title" class="project-title"></span>
  <div class="top-actions"><span id="save-status" role="status" class="save-status">${icon('hard-drive')} 本地项目</span>
    ${button('settings', 'settings', '设置')}
    <button id="exports" class="outline" popovertarget="export-menu">${icon('arrow-down-to-line')} 导出 ${icon('chevron-down')}</button>
    <div id="export-menu" class="menu" popover><button id="export-json">场景 JSON</button><button id="export-glb">场景 GLB</button><button id="export-video">全片预演 WebM</button></div>
    <button id="generate" class="primary">${icon('sparkles')} 生成视频</button>
  </div>
</header>
<main class="studio">
  <aside class="scene-panel">
    <div class="panel-head"><span>${icon('layers-3')} 场景</span>${button('add', 'plus', '添加对象')}</div>
    <div class="section-label">场景对象 <span id="object-count"></span></div>
    <div id="objects" class="objects"></div>
    <div id="inspector" class="inspector"></div>
    <div class="scene-footer"><button id="restore" class="ghost">${icon('rotate-ccw')} 恢复示例</button></div>
  </aside>
  <section class="work">
    <div class="view-head">
      <div class="tabs" aria-label="视图模式"><button id="orbit" type="button">${icon('orbit')} 场景视图</button><button id="camera" type="button" aria-pressed="true">${icon('focus')} 镜头预览</button></div>
      <span class="view-format">16:9 <b></b> 24 FPS</span>
    </div>
    <div class="viewport-area">
      <div id="viewport" class="viewport">
        <div class="view-badge"><i></i><span id="current-shot"></span></div>
        <div class="corners" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div id="capture-status" class="capture-status" hidden></div>
        <span class="viewport-note" id="viewport-note">3D 预演</span>
      </div>
      <div class="playback">
        <div class="transport">${button('first-shot','skip-back','上一镜头')}${button('play','play','播放')}${button('next-shot','skip-forward','下一镜头')}</div>
        <output id="time-label"></output><span class="transport-format">24 FPS</span>
      </div>
    </div>
    <section class="timeline">
      <div class="panel-head"><span>${icon('clapperboard')} 分镜时间线</span><div class="timeline-actions"><span id="shot-count"></span>${button('add-shot', 'plus', '添加镜头')}</div></div>
      <div class="time-track">
        <div id="ruler" class="ruler"></div><div id="shots" class="shots"></div>
        <input id="scrub" class="scrub" type="range" min="0" step="0.01" aria-label="拖动播放进度">
        <div id="playhead" class="playhead"></div>
      </div>
      <div class="shot-editor" id="shot-editor"></div>
    </section>
  </section>
  <aside class="agent-panel">
    <div class="panel-head"><span><i class="agent-icon">${icon('sparkles')}</i> 导演 Agent</span><span class="pill" id="model-badge">本地</span></div>
    <div class="conversation" id="conversation" role="log"></div>
    <div class="compose">
      <div class="chips" id="suggestions"><button data-prompt="让第一个镜头从更低的机位推进">降低相机机位</button><button data-prompt="让勘探车在信标附近停下，最后一镜从侧面观察它">改变车辆走位</button></div>
      <form id="agent-form" class="composer">
        <textarea id="prompt" maxlength="4000" rows="2" placeholder="描述场景、角色走位或运镜…" aria-label="导演指令"></textarea>
        <div class="composer-bottom"><span id="context-tag">${icon('scan-line')} 当前场景</span><button id="send" class="send" aria-label="发送">${icon('arrow-up')}</button></div>
      </form>
      <div class="agent-footer"><span><i></i> 本地工作台</span><a href="https://github.com/CPPAlien/open-direct-video" target="_blank" rel="noreferrer">OpenDirect</a></div>
    </div>
  </aside>
</main>
<dialog id="video-dialog" class="dialog">
  <div class="dialog-head"><h2>${icon('film')} 生成视频</h2>${button('close-video','x','关闭')}</div>
  <p id="video-shot"></p>
  <form id="video-form">
    <label for="video-prompt">成片描述</label>
    <textarea id="video-prompt" rows="3" maxlength="4000" required placeholder="描述成片风格、光照与细节…"></textarea>
    <label class="checkbox"><input type="checkbox" id="video-reference" checked> 同时录制镜头预演作为运动参考</label>
    <p id="video-config" class="muted"></p>
    <div class="dialog-actions"><button type="button" id="video-playblast" class="outline">导出该镜头预演</button><button id="submit-video" class="primary">${icon('sparkles')} 提交到 ComfyUI</button></div>
  </form>
  <div id="video-jobs" class="video-jobs"></div>
</dialog>
<dialog id="settings-dialog" class="dialog">
  <div class="dialog-head"><h2>${icon('settings')} 设置</h2>${button('close-settings','x','关闭设置')}</div>
  <form id="settings-form" class="settings-form">
    <fieldset><legend>导演模型</legend>
      <label>OpenAI 兼容 API 地址<input id="llm-url" type="url" placeholder="http://127.0.0.1:11434/v1"></label>
      <label>模型名称<input id="llm-model" placeholder="输入本地或远程模型的 ID" maxlength="100"></label>
      <label>API Key（可选）<input id="llm-key" type="password" autocomplete="off"></label>
      <label class="checkbox"><input id="llm-clear" type="checkbox"> 清除已保存的 API Key</label>
      <p class="muted">不配置模型也可以使用内置指令。远程模型会接收指令与当前场景。</p>
    </fieldset>
    <fieldset><legend>视频生成</legend>
      <label>ComfyUI 地址<input id="comfy-url" type="url" required></label>
      <label>工作流 JSON 的绝对路径<input id="comfy-workflow" placeholder="/path/to/workflow-api.json"></label>
      <p class="muted">使用 API 格式工作流，并将首尾帧或视频节点的文件名设为参考占位符。</p>
    </fieldset>
    <p class="settings-directory muted" id="settings-directory"></p>
    <div class="dialog-actions"><button id="save-settings" class="primary">保存设置</button></div>
  </form>
</dialog>
<div id="toast" class="toast" role="status" hidden></div>
`;
let project = { revision: 0, scene: demoScene, history: [], jobs: [] };
let config = {}, time = 0, mode = 'camera', selected = 'rover', playing = false, busy = false, loaded = false, captureActive = false, activeShot = -1;
let toastTimer, playFrame, runController, jobPoll, dialogShot;
const scene = () => project.scene;
const viewport = createViewport($('viewport'), id => select(id));

async function api(path, options) {
  const response = await fetch('/api' + path, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw Error(error.error || '请求失败（HTTP ' + response.status + '）');
  }
  return response;
}
const json = (method, value, signal) => ({ method, signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
function notify(text, error = false) {
  $('toast').textContent = text;
  $('toast').classList.toggle('error', error);
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6500);
}
function refreshDisabled() {
  for (const id of ['add', 'add-shot', 'restore', 'generate', 'exports', 'settings']) $(id).disabled = busy || captureActive || !loaded;
  $('send').disabled = !loaded || captureActive || (!runController && (busy || !$('prompt').value.trim()));
  $('send').innerHTML = icon(runController ? 'x' : 'arrow-up');
  $('send').setAttribute('aria-label', runController ? '取消 Agent 任务' : '发送');
  $('video-playblast').disabled = captureActive || busy;
  $('submit-video').disabled = !config.video || captureActive || busy;
}
function setBusy(value) { busy = value; refreshDisabled(); }
function setMode(value) {
  mode = value;
  viewport.setMode(value);
  for (const id of ['orbit', 'camera']) $(id).setAttribute('aria-pressed', String(id === value));
  $('viewport-note').textContent = value === 'orbit' ? '拖动旋转 · 滚轮缩放' : '3D 预演';
  if (activeShot >= 0) renderShotEditor();
}
function select(id) {
  selected = id;
  viewport.select(id);
  renderObjects();
  $('context-tag').innerHTML = icon('scan-line') + ' ' + esc(scene().objects.find(o => o.id === id)?.name || '当前场景');
}
function rangeFor(index) {
  const shot = scene().shots[index];
  const start = scene().shots.slice(0, index).reduce((sum, item) => sum + item.duration, 0);
  return { start, length: shot.duration, shot };
}
function setTime(value) {
  time = Math.min(duration(scene()), Math.max(0, value));
  const sample = sampleShot(scene(), time);
  viewport.setTime(time);
  $('current-shot').textContent = String(sample.index + 1).padStart(2, '0') + ' / ' + sample.name;
  $('scrub').value = time;
  $('time-label').innerHTML = esc(timecode(time)) + ' <span>/ ' + esc(timecode(duration(scene()))) + '</span>';
  $('playhead').style.left = time / duration(scene()) * 100 + '%';
  if (activeShot !== sample.index) {
    activeShot = sample.index;
    for (const child of $('shots').children) child.setAttribute('aria-pressed', String(Number(child.dataset.shot) === activeShot));
    renderShotEditor();
  }
}
function play(value) {
  if (value && captureActive) return;
  playing = value;
  cancelAnimationFrame(playFrame);
  $('play').innerHTML = icon(playing ? 'pause' : 'play');
  $('play').setAttribute('aria-label', playing ? '暂停' : '播放');
  if (!playing) return;
  if (time >= duration(scene()) - .01) setTime(0);
  let last = performance.now();
  const tick = now => {
    setTime(time + (now - last) / 1000);
    last = now;
    if (time >= duration(scene())) play(false);
    else playFrame = requestAnimationFrame(tick);
  };
  playFrame = requestAnimationFrame(tick);
}
function renderObjects() {
  $('object-count').textContent = String(scene().objects.length).padStart(2, '0');
  $('objects').innerHTML = scene().objects.map(o => '<button type="button" class="object" data-object="' + esc(o.id) +
    '" aria-pressed="' + (o.id === selected) + '">' + icon('box') + '<span>' + esc(o.name) +
    '</span><i style="background:' + esc(o.color) + '"></i></button>').join('') || '<p class="muted">暂无对象</p>';
  const item = scene().objects.find(o => o.id === selected);
  const number = (value, name, label) => '<label>' + label + '<input type="number" step="0.1" name="' + name + '" value="' + value + '" required></label>';
  $('inspector').innerHTML = item ? '<div class="section-label">变换</div><form id="object-form"><div class="axis">' +
    item.position.map((v, i) => number(v, 'position' + i, ['X', 'Y', 'Z'][i])).join('') +
    '</div><div class="appearance">' + number(item.rotation[1], 'yaw', 'Y°') +
    '<label>色彩 <input type="color" name="color" value="' + esc(item.color) + '"></label></div>' +
    '<div class="inspector-actions"><button type="submit" class="outline">应用变换</button><button id="remove-object" type="button" class="ghost">删除</button></div></form>' : '';
}
function renderTimeline() {
  const total = duration(scene());
  $('scrub').max = total;
  $('shot-count').textContent = scene().shots.length + ' 个镜头';
  $('ruler').innerHTML = Array.from({ length: 5 }, (_, i) => '<span>' + +(total * i / 4).toFixed(1) + 's</span>').join('');
  $('shots').innerHTML = scene().shots.map((shot, i) => '<button type="button" data-shot="' + i + '" style="flex:' + shot.duration +
    '"><small>' + String(i + 1).padStart(2, '0') + '</small><strong>' + esc(shot.name) + '</strong><span>' + shot.duration + 's</span></button>').join('');
  activeShot = -1;
  setTime(time);
}
function renderShotEditor() {
  const { shot } = rangeFor(activeShot);
  $('shot-editor').innerHTML = '<form id="shot-form"><label>镜头名称 <input name="name" maxlength="80" required value="' + esc(shot.name) +
    '"></label><label>时长（秒） <input name="duration" type="number" min="0.5" max="20" step="0.1" required value="' + shot.duration +
    '"></label><label>视角（°） <input name="fov" type="number" min="20" max="95" step="1" required value="' + shot.fov +
    '"></label><button type="submit" class="outline">应用</button>' +
    (scene().shots.length > 1 ? '<button id="remove-shot" type="button" class="ghost">删除</button>' : '') + '</form>' +
    (mode === 'orbit' ? '<div class="camera-tools"><button id="set-shot-start" class="outline">设为起始机位</button><button id="set-shot-end" class="outline">设为结束机位</button></div>' : '');
}
function renderConversation(turns = project.history, log = []) {
  $('conversation').innerHTML = '<div class="conversation-intro"><span class="intro-symbol">' + icon('aperture') +
    '</span><h1>先排镜头，再开拍。</h1><p>我能帮你搭建 3D 场景、编辑角色走位和规划镜头。试试给我一段镜头描述。</p></div>' +
    turns.map(turn => '<div class="bubble ' + (turn.role === 'user' ? 'user' : 'assistant') + '">' + esc(turn.text) +
      (turn.operations?.length ? '<small>' + turn.operations.length + ' 项场景操作已应用</small>' : '') + '</div>').join('') +
    log.map(step => '<div class="step">' + icon(step.issues ? 'triangle-alert' : 'check') + ' ' + esc(step.name) +
      ' <small>第 ' + step.attempt + ' 次</small></div>').join('');
  $('conversation').scrollTop = $('conversation').scrollHeight;
}
function showProject(next) {
  project = next;
  $('project-title').textContent = scene().title;
  viewport.load(scene());
  select(scene().objects.some(o => o.id === selected) ? selected : null);
  renderTimeline();
  renderConversation();
}
async function save(next) {
  if (!loaded || busy || captureActive) return;
  setBusy(true);
  play(false);
  try {
    const previousRevision = project.revision;
    showProject(await (await api('/project', json('PUT', { revision: previousRevision, scene: next }))).json());
    $('save-status').innerHTML = icon('check') + ' 已保存至本地';
  } catch (error) { notify(error.message, true); }
  finally { setBusy(false); }
}
function changeScene(edit) {
  const updated = structuredClone(scene());
  edit(updated);
  return save(updated);
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const dataUri = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});
async function capture(start, length, clip) {
  const overlay = $('capture-status');
  overlay.hidden = false;
  overlay.textContent = '准备 3D 参考画面…';
  try { return await viewport.capture(start, length, clip, fraction => { overlay.textContent = '录制预演 ' + Math.round(fraction * 100) + '%'; }); }
  finally { overlay.hidden = true; }
}
async function withCapture(task) {
  if (captureActive || busy || !loaded) return;
  captureActive = true;
  play(false);
  refreshDisabled();
  try { await task(); }
  catch (error) { notify(error.message, true); }
  finally { captureActive = false; refreshDisabled(); }
}
function playblast(start, length, name) {
  return withCapture(async () => {
    const { clip } = await capture(start, length, true);
    download(clip, name + '.webm');
    notify('预演视频已导出');
  });
}
async function sendAgent(event) {
  event.preventDefault();
  if (runController) { runController.abort(); return; }
  const prompt = $('prompt').value.trim();
  if (!prompt || busy || captureActive || !loaded) return;
  const pending = [...project.history, { role: 'user', text: prompt }];
  const log = [];
  const controller = new AbortController();
  runController = controller;
  setBusy(true);
  play(false);
  renderConversation(pending);
  try {
    const response = await api('/agent', json('POST', { prompt, revision: project.revision, selectedId: selected ?? undefined }, controller.signal));
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', finished = false;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines.filter(Boolean)) {
        const data = JSON.parse(line);
        if (data.type === 'step') { log.push(data); renderConversation(pending, log); }
        if (data.type === 'error') throw Error(data.error);
        if (data.type === 'result') {
          finished = true;
          showProject(data.project);
          $('prompt').value = '';
          notify('Agent 已更新场景');
        }
      }
    }
    if (!finished) throw Error('连接结束，未收到场景结果');
  } catch (error) {
    // 重读场景以处理服务端已提交、客户端恰好取消的竞态。
    try { showProject(await (await api('/project')).json()); } catch { renderConversation(); }
    notify(error.name === 'AbortError' ? '已停止等待 Agent' : error.message, error.name !== 'AbortError');
  } finally { runController = null; setBusy(false); }
}
function setConfig(next) {
  config = next;
  $('model-badge').textContent = config.agent ? config.model : '本地指令';
  $('prompt').placeholder = config.agent ? '描述场景、角色走位或运镜…' : '试试本地指令，或配置模型后自由描述…';
  refreshDisabled();
}
$('settings').onclick = async () => {
  try {
    const settings = await (await api('/settings')).json();
    $('llm-url').value = settings.llmUrl;
    $('llm-model').value = settings.llmModel;
    $('llm-key').value = '';
    $('llm-key').placeholder = settings.hasKey ? '已保存，留空保持原值' : '本地模型通常不需要';
    $('llm-clear').checked = false;
    $('llm-clear').disabled = !settings.hasKey;
    $('comfy-url').value = settings.comfyUrl;
    $('comfy-workflow').value = settings.workflowPath;
    $('settings-directory').textContent = '项目与设置目录 ' + settings.directory;
    $('settings-dialog').showModal();
  } catch (error) { notify(error.message, true); }
};
$('close-settings').onclick = () => $('settings-dialog').close();
$('settings-form').onsubmit = async event => {
  event.preventDefault();
  const llmUrl = $('llm-url').value.trim();
  const llmModel = $('llm-model').value.trim();
  if (!!llmUrl !== !!llmModel) return notify('请同时填写模型地址和模型名称，或同时留空', true);
  $('save-settings').disabled = true;
  try {
    await api('/settings', json('PUT', { llmUrl, llmModel, llmKey: $('llm-key').value,
      clearKey: $('llm-clear').checked, comfyUrl: $('comfy-url').value.trim(), workflowPath: $('comfy-workflow').value.trim() }));
    $('llm-key').value = '';
    setConfig(await (await api('/config')).json());
    $('settings-dialog').close();
    notify('设置已保存');
  } catch (error) { notify(error.message, true); }
  finally { $('save-settings').disabled = false; }
};
const jobStates = new Map();
function renderJobs() {
  $('video-jobs').innerHTML = project.jobs.map(job => {
    const info = jobStates.get(job.id);
    return '<div class="job"><strong>' + esc(job.shot) + '</strong><span>' +
      esc(info?.status === 'complete' ? '生成完成' : info?.status === 'failed' ? info.error : info?.offline ? '无法获取状态' : '等待 ComfyUI') + '</span>' +
      (info?.status === 'complete' ? '<video controls playsinline preload="none" src="' + esc(info.video) + '"></video><a href="' + esc(info.video) + '" download>下载视频</a>' : '') + '</div>';
  }).join('');
}
async function pollJobs() {
  clearTimeout(jobPoll);
  if (!$('video-dialog').open || !config.video) return;
  await Promise.all(project.jobs.slice(0, 6).filter(job => !['complete', 'failed'].includes(jobStates.get(job.id)?.status)).map(async job => {
    try { jobStates.set(job.id, await (await api('/video/' + encodeURIComponent(job.id))).json()); }
    catch { jobStates.set(job.id, { offline: true }); }
  }));
  if (!$('video-dialog').open) return;
  // 避免刷新轮询时重建正在播放的 video。
  for (const [index, job] of project.jobs.entries()) {
    const node = $('video-jobs').children[index];
    const info = jobStates.get(job.id);
    if (!node) { renderJobs(); break; }
    if (info?.status === 'complete' && !node.querySelector('video')) {
      const video = document.createElement('video');
      Object.assign(video, { src: info.video, controls: true, playsInline: true, preload: 'none' });
      const link = Object.assign(document.createElement('a'), { href: info.video, download: '', textContent: '下载视频' });
      node.append(video, link);
    }
    node.querySelector('span').textContent = info?.status === 'complete' ? '生成完成'
      : info?.status === 'failed' ? info.error : info?.offline ? '无法获取状态' : '等待 ComfyUI';
  }
  jobPoll = setTimeout(pollJobs, 3000);
}
$('generate').onclick = () => {
  dialogShot = rangeFor(activeShot);
  $('video-shot').textContent = dialogShot.shot.name + ' · ' + dialogShot.length + ' 秒 · 3D 参考';
  $('video-config').textContent = config.video ? '工作流会读取其配置需要的首帧、尾帧或运动参考。' : '在设置中添加 ComfyUI 工作流后即可生成视频。当前可导出预演。';
  $('video-dialog').showModal();
  renderJobs();
  pollJobs();
};
$('close-video').onclick = () => $('video-dialog').close();
$('video-dialog').addEventListener('close', () => clearTimeout(jobPoll));
$('video-playblast').onclick = () => {
  $('video-dialog').close();
  playblast(dialogShot.start, dialogShot.length, dialogShot.shot.id + '-previs');
};
$('video-form').onsubmit = event => {
  event.preventDefault();
  if (!config.video) return;
  const prompt = $('video-prompt').value.trim();
  if (!prompt) return;
  const reference = $('video-reference').checked;
  $('video-dialog').close();
  withCapture(async () => {
    const { start, length, shot } = dialogShot;
    const { first, last, clip } = await capture(start, length, reference);
    await api('/video', json('POST', { prompt, first, last, shot: shot.name, reference: clip ? await dataUri(clip) : undefined }));
    const next = await (await api('/project')).json();
    project.jobs = next.jobs;
    notify('已提交 ComfyUI 视频生成任务');
    $('video-dialog').showModal();
    renderJobs();
    pollJobs();
  });
};
$('export-json').onclick = () => {
  $('export-menu').hidePopover();
  download(new Blob([JSON.stringify(scene(), null, 2)], { type: 'application/json' }), 'opendirect-scene.json');
};
$('export-glb').onclick = () => {
  $('export-menu').hidePopover();
  withCapture(async () => download(await viewport.exportGlb(), 'opendirect-scene.glb'));
};
$('export-video').onclick = () => {
  $('export-menu').hidePopover();
  playblast(0, duration(scene()), 'opendirect-previs');
};
$('agent-form').onsubmit = sendAgent;
$('prompt').oninput = refreshDisabled;
$('prompt').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !$('send').disabled) {
    event.preventDefault();
    $('agent-form').requestSubmit();
  }
});
$('suggestions').addEventListener('click', event => {
  if (!event.target.dataset.prompt) return;
  $('prompt').value = event.target.dataset.prompt;
  refreshDisabled();
  $('prompt').focus();
});
$('orbit').onclick = () => setMode('orbit');
$('camera').onclick = () => setMode('camera');
$('play').onclick = () => play(!playing);
$('first-shot').onclick = () => { play(false); setTime(rangeFor(Math.max(0, activeShot - 1)).start); };
$('next-shot').onclick = () => { play(false); setTime(rangeFor(Math.min(scene().shots.length - 1, activeShot + 1)).start); };
$('scrub').oninput = event => { play(false); setTime(Number(event.target.value)); };
$('shots').onclick = event => {
  const shot = event.target.closest('[data-shot]');
  if (shot) { play(false); setTime(rangeFor(Number(shot.dataset.shot)).start); }
};
$('objects').onclick = event => {
  const object = event.target.closest('[data-object]');
  if (object) select(object.dataset.object);
};
$('add').onclick = () => {
  if (scene().objects.length >= 100) return notify('已达到 100 个对象上限', true);
  const id = 'box-' + crypto.randomUUID().slice(0, 8);
  selected = id;
  changeScene(next => next.objects.push({ id, name: '立方体', shape: 'box', position: [2, .5, 0],
    rotation: [0, 0, 0], scale: [1, 1, 1], path: [], color: '#db9c68' }));
};
$('add-shot').onclick = () => {
  const remaining = 60 - duration(scene());
  if (scene().shots.length >= 8 || remaining < .5) return notify('镜头上限为 8 个，总时长上限为 60 秒', true);
  const previous = scene().shots[activeShot];
  changeScene(next => next.shots.push({ ...previous, id: 'shot-' + crypto.randomUUID().slice(0, 8),
    name: '新镜头', duration: Math.min(4, remaining) }));
};
$('inspector').onsubmit = event => {
  event.preventDefault();
  if (event.target.id !== 'object-form') return;
  const data = new FormData(event.target);
  changeScene(next => {
    const item = next.objects.find(o => o.id === selected);
    const position = [0, 1, 2].map(i => Number(data.get('position' + i)));
    const yaw = Number(data.get('yaw'));
    for (const point of item.path) {
      point.position = point.position.map((v, i) => v + position[i] - item.position[i]);
      point.yaw += yaw - item.rotation[1];
    }
    item.position = position;
    item.rotation[1] = yaw;
    item.color = data.get('color');
  });
};
$('inspector').onclick = event => {
  if (event.target.id !== 'remove-object') return;
  changeScene(next => {
    const original = next.objects.find(o => o.id === selected);
    next.objects = next.objects.filter(o => o.id !== selected);
    for (const shot of next.shots.filter(s => s.targetId === selected)) {
      shot.lookAt = shot.lookAt.map((v, i) => v + original.position[i]);
      delete shot.targetId;
    }
  });
};
$('shot-editor').onsubmit = event => {
  event.preventDefault();
  const data = new FormData(event.target);
  changeScene(next => Object.assign(next.shots[activeShot], { name: data.get('name').trim(),
    duration: Number(data.get('duration')), fov: Number(data.get('fov')) }));
};
$('shot-editor').onclick = event => {
  if (event.target.id === 'remove-shot' && scene().shots.length > 1) changeScene(next => next.shots.splice(activeShot, 1));
  const side = { 'set-shot-start': 'from', 'set-shot-end': 'to' }[event.target.id];
  if (side) {
    const pose = viewport.orbitPose();
    changeScene(next => {
      const shot = next.shots[activeShot];
      shot[side] = pose.position;
      shot.lookAt = pose.target;
      delete shot.targetId;
    });
  }
};
$('restore').onclick = () => {
  if (window.confirm('恢复示例将替换当前场景。继续吗？')) save(demoScene);
};
document.addEventListener('keydown', event => {
  if (event.code === 'Space' && ['BODY', 'CANVAS'].includes(document.activeElement.tagName) && !$('video-dialog').open) {
    event.preventDefault();
    play(!playing);
  }
});
setMode(mode);
showProject(project);
refreshDisabled();
try {
  const [saved, options] = await Promise.all([api('/project'), api('/config')]);
  setConfig(await options.json());
  showProject(await saved.json());
  loaded = true;
  refreshDisabled();
} catch (error) { notify(error.message, true); }

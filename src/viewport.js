import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { objectPose, sampleShot } from './scene.js';

const radians = THREE.MathUtils.degToRad;
const material = color => new THREE.MeshStandardMaterial({ color, roughness: .82 });
function mesh(group, geometry, color, position, rotation) {
  const item = new THREE.Mesh(geometry, material(color));
  item.position.set(...position);
  if (rotation) item.rotation.set(...rotation);
  item.castShadow = item.receiveShadow = true;
  group.add(item);
  return item;
}
const box = (g, size, color, at) => mesh(g, new THREE.BoxGeometry(...size), color, at);
const cylinder = (g, top, bottom, h, color, at, rotation, sides = 20) =>
  mesh(g, new THREE.CylinderGeometry(top, bottom, h, sides), color, at, rotation);

function makeObject(object) {
  const { shape, color } = object;
  const group = new THREE.Group();
  group.name = object.name;
  group.userData.entityId = object.id;
  if (shape === 'glb') return group;
  if (shape === 'rover') {
    box(group, [1.13, .44, 1.9], color, [0, 0, 0]);
    box(group, [.83, .46, .92], '#344751', [0, .39, .11]);
    box(group, [1.22, .11, 1.95], '#e5aa65', [0, .23, 0]);
    box(group, [.72, .095, .05], '#fff4c9', [0, .11, .97]);
    for (const side of [-1, 1]) for (const z of [-.62, .61]) {
      cylinder(group, .32, .32, .22, '#2f2d34', [side * .58, -.17, z], [0, 0, Math.PI / 2]);
      cylinder(group, .14, .14, .23, '#877c78', [side * .62, -.17, z], [0, 0, Math.PI / 2]);
    }
  } else if (shape === 'tower') {
    cylinder(group, 1.5, 1.8, .38, '#715052', [0, .18, 0], null, 8);
    cylinder(group, .76, 1.02, 3.8, color, [0, 2.2, 0], null, 8);
    for (const y of [1.1, 2.95, 3.9]) cylinder(group, .94, .98, .15, '#995b52', [0, y, 0], null, 8);
    cylinder(group, .82, .98, .32, '#334755', [0, 4.2, 0], null, 8);
    cylinder(group, .62, .62, .48, '#e6a658', [0, 4.55, 0], null, 8);
    cylinder(group, .18, .91, .55, '#514758', [0, 5, 0], null, 8);
    cylinder(group, .035, .035, .85, '#514758', [0, 5.61, 0]);
    box(group, [1.35, .21, 1.35], '#514758', [0, .36, 0]);
  } else if (shape === 'rock') {
    const rock = mesh(group, new THREE.IcosahedronGeometry(.71, 0), color, [0, .38, 0], [0, .61, .09]);
    rock.scale.set(1, .78, 1);
    const fragment = mesh(group, new THREE.DodecahedronGeometry(.34, 0), color, [.35, .18, .27], [.3, .73, .1]);
    fragment.scale.y = .65;
  } else {
    const geometry = {
      box: () => new THREE.BoxGeometry(), sphere: () => new THREE.SphereGeometry(.5, 24, 16),
      cylinder: () => new THREE.CylinderGeometry(.5, .5, 1, 24), cone: () => new THREE.ConeGeometry(.5, 1, 24),
      torus: () => new THREE.TorusGeometry(.38, .12, 12, 32), platform: () => new THREE.BoxGeometry(),
    }[shape]();
    mesh(group, geometry, color, [0, 0, 0]);
    if (shape === 'platform') {
      for (const x of [-.41, .41]) box(group, [.016, .02, .83], '#f6c978', [x, .51, 0]);
      for (const z of [-.4, .4]) box(group, [.83, .02, .025], '#f6c978', [0, .51, z]);
    }
  }
  group.scale.set(...object.scale);
  return group;
}

export function createViewport(container, onSelect, onError = () => {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', '交互式 3D 场景');
  container.prepend(canvas);
  const world = new THREE.Scene();
  const root = new THREE.Group();
  root.name = 'OpenDirect scene';
  world.add(root);
  const ground = mesh(root, new THREE.PlaneGeometry(160, 160), '#b96f52', [0, -.06, 0], [-Math.PI / 2, 0, 0]);
  ground.name = 'Ground';
  ground.castShadow = false;
  const hemi = new THREE.HemisphereLight('#fff0e2', '#a87981', 2.2);
  const sun = new THREE.DirectionalLight('#ffe0af', 3.1);
  sun.position.set(-9, 14, 6);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 45 });
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.normalBias = .055;
  world.add(hemi, sun);
  const editCamera = new THREE.PerspectiveCamera(45, 1, .05, 180);
  editCamera.position.set(11, 6.5, 13);
  const camera = new THREE.PerspectiveCamera(42, 1, .05, 180);
  const controls = new OrbitControls(editCamera, canvas);
  controls.target.set(0, 1.6, -.65);
  controls.minDistance = 2;
  controls.maxDistance = 70;
  controls.maxPolarAngle = Math.PI / 2 - .025;
  controls.update();
  const outline = new THREE.BoxHelper(new THREE.Object3D(), 0xffab70);
  outline.visible = false;
  world.add(outline);
  const objects = new Map();
  const loader = new GLTFLoader();
  loader.manager.setURLModifier(url => {
    if (/^(blob:|data:)/i.test(url)) return url;
    throw Error('GLB 包含外部引用');
  });
  const loading = new Set();
  function dispose(node) {
    node.traverse(child => {
      child.geometry?.dispose();
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        if (!material) continue;
        for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
        material.dispose();
      }
    });
  }
  async function importAsset(id) {
    const response = await fetch('/api/assets/' + id + '/glb');
    if (!response.ok) throw Error('无法读取本地 GLB');
    const { scene } = await loader.parseAsync(await response.arrayBuffer(), '');
    scene.traverse(node => { if (node.isMesh) node.castShadow = node.receiveShadow = true; });
    const bounds = new THREE.Box3().setFromObject(scene);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const factor = 2 / (Math.max(size.x, size.y, size.z) || 1);
    const model = new THREE.Group();
    model.name = scene.name || 'Imported GLB';
    scene.position.sub(new THREE.Vector3(center.x, bounds.isEmpty() ? 0 : bounds.min.y, center.z));
    model.add(scene);
    model.scale.setScalar(factor);
    return model;
  }
  let scene, selected, time = 0, mode = 'camera', exporting = false;

  const pose = (node, item, at) => {
    const { position, yaw } = objectPose(item, at);
    node.position.set(...position);
    node.rotation.set(radians(item.rotation[0]), radians(yaw), radians(item.rotation[2]));
  };
  function draw(at = time, view = mode) {
    if (!scene || (!exporting && (!container.clientWidth || !container.clientHeight))) return;
    for (const item of scene.objects) pose(objects.get(item.id), item, at);
    const shot = sampleShot(scene, at);
    camera.position.set(...shot.position);
    camera.lookAt(...shot.lookAt);
    camera.fov = shot.fov;
    camera.updateProjectionMatrix();
    outline.visible = view === 'orbit' && !!objects.get(selected);
    if (outline.visible) outline.setFromObject(objects.get(selected));
    renderer.render(world, view === 'orbit' ? editCamera : camera);
  }
  function resize() {
    if (exporting) return;
    const { clientWidth: width, clientHeight: height } = container;
    if (!width || !height) return;
    editCamera.aspect = camera.aspect = width / height;
    editCamera.updateProjectionMatrix();
    renderer.setSize(width, height);
    draw();
  }
  new ResizeObserver(resize).observe(container);
  controls.addEventListener('change', () => { if (!exporting && mode === 'orbit') draw(); });
  let down;
  canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', e => {
    if (exporting || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
    const bounds = canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((e.clientX - bounds.left) / bounds.width * 2 - 1,
      1 - (e.clientY - bounds.top) / bounds.height * 2), mode === 'orbit' ? editCamera : camera);
    let hit = ray.intersectObjects([...objects.values()], true)[0]?.object;
    while (hit && !hit.userData.entityId) hit = hit.parent;
    onSelect(hit?.userData.entityId ?? null);
  });
  function prepare() {
    exporting = true;
    controls.enabled = false;
    renderer.setPixelRatio(1);
    renderer.setSize(960, 540, false);
    camera.aspect = 16 / 9;
  }
  function restore() {
    exporting = false;
    controls.enabled = mode === 'orbit';
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    resize();
  }
  async function record(start, length, progress = () => {}) {
    const encodings = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mimeType = encodings.find(item => globalThis.MediaRecorder?.isTypeSupported(item));
    if (!mimeType || !canvas.captureStream) throw Error('当前浏览器无法录制 WebM，请使用 Chrome 或 Edge');
    const fps = 24, frames = Math.ceil(length * fps);
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    try {
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_800_000 });
      const chunks = [];
      const result = new Promise((resolve, reject) => {
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onstop = () => chunks.length ? resolve(new Blob(chunks, { type: 'video/webm' })) : reject(Error('录屏没有返回视频'));
        recorder.onerror = () => reject(Error('浏览器录屏失败'));
      });
      await Promise.all([result, (async () => {
        recorder.start();
        try {
          for (let i = 0; i < frames && recorder.state === 'recording'; i++) {
            draw(start + i / fps, 'camera');
            track.requestFrame();
            progress((i + 1) / frames);
            await new Promise(resolve => setTimeout(resolve, 1000 / fps));
          }
        } finally { if (recorder.state === 'recording') recorder.stop(); }
      })()]);
      return await result;
    } finally { track.stop(); }
  }
  return {
    load(next) {
      scene = next;
      for (const node of objects.values()) {
        dispose(node);
        root.remove(node);
      }
      objects.clear();
      world.background = new THREE.Color(scene.background);
      world.fog = new THREE.FogExp2(scene.background, .026);
      ground.material.color.set(scene.ground);
      for (const object of scene.objects) {
        const node = makeObject(object);
        objects.set(object.id, node);
        root.add(node);
        if (object.assetId) {
          const task = importAsset(object.assetId).then(model => {
            if (objects.get(object.id) === node) {
              node.add(model);
              if (!exporting) draw();
            } else dispose(model);
          }).catch(error => {
            if (objects.get(object.id) !== node) return;
            mesh(node, new THREE.BoxGeometry(1, 1, 1), '#b55555', [0, .5, 0]);
            resize();
            onError('加载 ' + object.name + ' 失败：' + error.message);
          }).finally(() => loading.delete(task));
          loading.add(task);
        }
      }
      resize();
    },
    select(id) { selected = id; if (!exporting) draw(); },
    setMode(value) { mode = value; controls.enabled = value === 'orbit'; if (!exporting) draw(); },
    setTime(at) { time = at; if (!exporting) draw(); },
    orbitPose() {
      const rounded = vector => vector.toArray().map(value => +value.toFixed(3));
      return { position: rounded(editCamera.position), target: rounded(controls.target) };
    },
    async thumbnail(asset) {
      const stage = new THREE.Scene();
      stage.background = new THREE.Color(asset.backdrop ?? '#e4e9ed');
      const subject = asset.assetId ? await importAsset(asset.assetId) : makeObject(asset);
      if (exporting) { dispose(subject); return ''; }
      const bounds = new THREE.Box3().setFromObject(subject);
      if (bounds.isEmpty()) { dispose(subject); return ''; }
      const center = bounds.getCenter(new THREE.Vector3());
      const extents = bounds.getSize(new THREE.Vector3());
      const radius = Math.max(...extents.toArray()) * .75 || 1;
      const view = new THREE.PerspectiveCamera(38, 16 / 9, .01, 200);
      view.position.copy(center).add(new THREE.Vector3(1.65, .96, 1.95).multiplyScalar(radius));
      view.lookAt(center);
      const key = new THREE.DirectionalLight('#fff2d9', 2.8);
      key.position.set(-3, 5, 4);
      stage.add(subject, new THREE.HemisphereLight('#ffffff', '#84929b', 2.5), key);
      renderer.setPixelRatio(1);
      renderer.setSize(384, 216, false);
      try {
        renderer.render(stage, view);
        return canvas.toDataURL('image/jpeg', .82);
      } finally { dispose(subject); restore(); }
    },
    async capture(start, length, withClip, progress) {
      await Promise.all([...loading]);
      prepare();
      try {
        draw(start, 'camera');
        const first = canvas.toDataURL('image/png');
        draw(start + length - .001, 'camera');
        const last = canvas.toDataURL('image/png');
        return { first, last, ...(withClip ? { clip: await record(start, length, progress) } : {}) };
      } finally { restore(); }
    },
    async exportGlb() {
      await Promise.all([...loading]);
      draw(0);
      try {
        const tracks = scene.objects.flatMap(item => {
          if (item.path.length < 2) return [];
          const times = item.path.map(point => point.time);
          const name = objects.get(item.id).uuid;
          return [new THREE.VectorKeyframeTrack(name + '.position', times, item.path.flatMap(p => p.position)),
            new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, item.path.flatMap(p =>
              new THREE.Quaternion().setFromEuler(new THREE.Euler(radians(item.rotation[0]), radians(p.yaw), radians(item.rotation[2]))).toArray()))];
        });
        const exportScene = new THREE.Scene();
        exportScene.add(root.clone(true), hemi.clone(), sun.clone());
        // Exporter binds tracks by node name; clone UUIDs differ from preview UUIDs.
        const clones = exportScene.children[0].children;
        const mapping = new Map(root.children.map((node, index) => [node.uuid, clones[index].uuid]));
        for (const track of tracks) {
          const [uuid, property] = track.name.split('.');
          track.name = mapping.get(uuid) + '.' + property;
        }
        const animations = tracks.length ? [new THREE.AnimationClip('OpenDirect motion', -1, tracks)] : [];
        const bytes = await new GLTFExporter().parseAsync(exportScene, { binary: true, animations });
        return new Blob([bytes], { type: 'model/gltf-binary' });
      } finally { draw(); }
    },
  };
}

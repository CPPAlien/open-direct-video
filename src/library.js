const sample = (id, name, shape, color, backdrop, scale = [1, 1, 1]) => ({ id, name, shape, color, backdrop,
  position: [0, 0, 0], rotation: [0, 0, 0], scale, path: [], source: 'builtin',
});
const collection = [
  sample('library-rover', '勘探车', 'rover', '#d69349', '#fae3c9'),
  sample('library-tower', '信标站', 'tower', '#dcb5a1', '#dce9e1'),
  sample('library-rock', '山脊岩组', 'rock', '#907a9a', '#ebe3f4'),
  sample('library-pad', '着陆平台', 'platform', '#65838d', '#dce8f1', [2.6, .2, 1.9]),
  sample('library-box', '立方体', 'box', '#cc8f78', '#f3e0db'),
  sample('library-sphere', '球体', 'sphere', '#7d9a7c', '#e5eddb'),
  sample('library-cone', '圆锥体', 'cone', '#bf9e65', '#f0eadc'),
  sample('library-torus', '环体', 'torus', '#706da8', '#e5e4f2'),
];
export function libraryItems(imported = []) {
  return [...imported.map(record => ({
    ...sample(record.id, record.name, 'glb', '#a3a9b8', '#e2ebec'),
    ...record, assetId: record.id, source: 'imported',
  })).reverse(), ...collection];
}
export function sizeLabel(bytes) {
  return bytes >= 1024 * 1024 ? (bytes / (1024 * 1024)).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
}
export function createInstance(asset, id) {
  const value = { id, name: asset.name, shape: asset.shape, position: [1.5, asset.shape === 'rover' ? .6 :
    ['sphere', 'box', 'cone', 'torus', 'platform'].includes(asset.shape) ? asset.scale[1] / 2 : 0, 1.2],
  rotation: [0, 0, 0], scale: [...asset.scale], color: asset.color, path: [] };
  return asset.assetId ? { ...value, assetId: asset.assetId } : value;
}

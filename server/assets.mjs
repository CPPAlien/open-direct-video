import { z } from 'zod';

export const maxAssetBytes = 40 * 1024 * 1024;
export const assetName = z.string().trim().min(1).max(80);
export const assetId = z.uuid();

// Reject external buffers and images so a library item stays self-contained.
export function validateGlb(bytes) {
  const invalid = () => { throw Object.assign(Error('请选择完整且自包含的 GLB 2.0 文件'), { status: 400 }); };
  if (!Buffer.isBuffer(bytes) || bytes.length < 24 || bytes.length > maxAssetBytes) invalid();
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length || bytes.toString('ascii', 16, 20) !== 'JSON') invalid();
  const end = 20 + bytes.readUInt32LE(12);
  if (end > bytes.length || end % 4) invalid();
  let data;
  try { data = JSON.parse(bytes.toString('utf8', 20, end)); }
  catch { invalid(); }
  if (data?.asset?.version !== '2.0' || !Array.isArray(data.scenes) || !data.scenes.length) invalid();
  for (const entries of [data.buffers, data.images]) {
    if (entries === undefined) continue;
    if (!Array.isArray(entries) || entries.some(entry => !entry || (typeof entry.uri === 'string' && !/^data:/i.test(entry.uri)))) invalid();
  }
  for (let offset = end; offset < bytes.length;) {
    if (offset + 8 > bytes.length) invalid();
    const length = bytes.readUInt32LE(offset);
    if (length % 4 || offset + 8 + length > bytes.length) invalid();
    offset += 8 + length;
  }
  return data;
}

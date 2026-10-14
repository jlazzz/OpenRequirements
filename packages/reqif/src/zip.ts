// A .reqifz file is a plain zip archive. Reading and writing use the platform's own deflate (browsers and Node).

const MAX_UNPACKED = 300 * 1024 * 1024;

async function pipe(data: Uint8Array, through: CompressionStream | DecompressionStream, limit = Infinity) {
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(through).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    // Counted while unpacking, so a small archive that unpacks to gigabytes is stopped early.
    if (size > limit) throw new Error("The archive is too large when unpacked");
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/**
 * The files of a zip archive, by path. Trust boundary: the archive comes from outside.
 * Paths are only used as keys, never to write to disk. Encrypted and zip64 archives are refused.
 */
export async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The directory's end record is at the very end, before an optional comment of up to 65,535 bytes.
  let end = bytes.length - 22;
  while (end >= 0 && end >= bytes.length - 22 - 0xffff && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50) throw new Error("Not a zip archive");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map<string, Uint8Array>();
  let total = 0;
  const utf8 = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new Error("Damaged zip archive");
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const packed = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = utf8.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    if (flags & 1) throw new Error("Encrypted archives are not supported");
    if (packed === 0xffffffff || local === 0xffffffff) throw new Error("Archives over 4 GB are not supported");
    if (name.endsWith("/")) continue;
    if (local + 30 > bytes.length) throw new Error("Damaged zip archive");
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + packed);
    if (method !== 0 && method !== 8) throw new Error(`Unsupported compression in ${name}`);
    const content =
      method === 0 ? data : await pipe(data, new DecompressionStream("deflate-raw"), MAX_UNPACKED - total);
    total += content.length;
    if (total > MAX_UNPACKED) throw new Error("The archive is too large when unpacked");
    files.set(name, content);
  }
  return files;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Packs files into a zip archive. */
export async function zip(files: { name: string; data: Uint8Array }[]): Promise<Uint8Array> {
  const utf8 = new TextEncoder();
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = utf8.encode(file.name);
    const packed = await pipe(file.data, new CompressionStream("deflate-raw"));
    // Local header and directory entry share these fields: version, flags (UTF-8 names), deflate, time, date, CRC, sizes.
    const shared = new DataView(new ArrayBuffer(26));
    shared.setUint16(0, 20, true);
    shared.setUint16(2, 0x0800, true);
    shared.setUint16(4, 8, true);
    shared.setUint16(8, 0x21, true);
    shared.setUint32(10, crc32(file.data), true);
    shared.setUint32(14, packed.length, true);
    shared.setUint32(18, file.data.length, true);
    shared.setUint16(22, name.length, true);
    const header = new Uint8Array(30 + name.length);
    new DataView(header.buffer).setUint32(0, 0x04034b50, true);
    header.set(new Uint8Array(shared.buffer), 4);
    header.set(name, 30);
    const entry = new Uint8Array(46 + name.length);
    const entryView = new DataView(entry.buffer);
    entryView.setUint32(0, 0x02014b50, true);
    entryView.setUint16(4, 20, true);
    entry.set(new Uint8Array(shared.buffer), 6);
    entryView.setUint32(42, offset, true);
    entry.set(name, 46);
    parts.push(header, packed);
    directory.push(entry);
    offset += header.length + packed.length;
  }
  const size = directory.reduce((sum, entry) => sum + entry.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...directory, new Uint8Array(end.buffer)];
  const out = new Uint8Array(offset + size + 22);
  let at = 0;
  for (const part of all) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

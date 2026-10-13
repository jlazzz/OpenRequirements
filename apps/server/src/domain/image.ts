const starts = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, i) => bytes[offset + i] === byte);
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/**
 * The image type of a file, judged by its first bytes, or null when it is not an allowed image.
 * The browser's stated type is never trusted. SVG is not allowed because it can contain scripts.
 */
export function imageType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | null {
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts(bytes, ascii("GIF87a")) || starts(bytes, ascii("GIF89a"))) return "image/gif";
  if (starts(bytes, ascii("RIFF")) && starts(bytes, ascii("WEBP"), 8)) return "image/webp";
  return null;
}

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

/**
 * The type of an uploaded file, judged by its content, or null when it is not an allowed kind: an image, a PDF, a zip
 * archive, or text (logs, CSV). Text is anything that is valid UTF-8 with no NUL byte; a name ending in .csv makes it CSV.
 * Everything but an image is only ever served as a download, so text that happens to be HTML or a script is never run.
 */
export function fileType(bytes: Uint8Array, name = ""): string | null {
  const image = imageType(bytes);
  if (image) return image;
  if (starts(bytes, ascii("%PDF-"))) return "application/pdf";
  if (starts(bytes, [0x50, 0x4b, 0x03, 0x04]) || starts(bytes, [0x50, 0x4b, 0x05, 0x06])) return "application/zip";
  if (bytes.length === 0 || bytes.includes(0)) return null;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  return /\.csv$/i.test(name) ? "text/csv" : "text/plain";
}

/** A file name that is safe to store and to send back in a header: no path, no control or quote characters. */
export function safeFileName(name: string): string {
  return (
    name
      .split(/[/\\]/)
      .pop()
      ?.replace(/[^\w. ()-]/g, "_")
      .slice(0, 200) ?? ""
  );
}

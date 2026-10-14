import { expect, test } from "vitest";
import { fileType, imageType, safeFileName } from "./filetype.ts";

const bytes = (...parts: (string | number[])[]) =>
  Uint8Array.from(parts.flatMap((part) => (typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : part)));

test("recognises allowed image types by content", () => {
  expect(imageType(bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a], "rest"))).toBe("image/png");
  expect(imageType(bytes([0xff, 0xd8, 0xff, 0xe0], "JFIF"))).toBe("image/jpeg");
  expect(imageType(bytes("GIF89a..."))).toBe("image/gif");
  expect(imageType(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toBe("image/webp");
});

test("rejects everything else as an image, including SVG and HTML", () => {
  expect(imageType(bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>'))).toBeNull();
  expect(imageType(bytes("<!doctype html>"))).toBeNull();
  expect(imageType(bytes("RIFF", [0, 0, 0, 0], "WAVE"))).toBeNull();
  expect(imageType(bytes([0x89], "PN"))).toBeNull();
  expect(imageType(new Uint8Array())).toBeNull();
});

test("recognises evidence files by content: images, PDF, zip and text", () => {
  expect(fileType(bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
  expect(fileType(bytes("%PDF-1.7\n"))).toBe("application/pdf");
  expect(fileType(bytes("PK", [3, 4], "rest"))).toBe("application/zip");
  expect(fileType(new TextEncoder().encode("12:00 pump stopped ✓\n"), "bench.log")).toBe("text/plain");
  expect(fileType(bytes("a,b\n1,2\n"), "Results.CSV")).toBe("text/csv");
  // Text that is really a page is still only text: it is served as a download, never shown.
  expect(fileType(bytes("<script>alert(1)</script>"), "x.html")).toBe("text/plain");
});

test("refuses binaries, broken UTF-8 and empty files", () => {
  expect(fileType(bytes("MZ", [0x90, 0, 3, 0]), "tool.exe")).toBeNull();
  expect(fileType(bytes([0x7f], "ELF", [2, 1, 1, 0]))).toBeNull();
  expect(fileType(bytes([0xff, 0xfe, 0x41]))).toBeNull();
  expect(fileType(new Uint8Array())).toBeNull();
});

test("a stored file name has no path and nothing that could break a header", () => {
  expect(safeFileName("C:\\logs\\bench 2 (final).log")).toBe("bench 2 (final).log");
  expect(safeFileName('../../etc/pa"ss\r\nwd')).toBe("pa_ss__wd");
  expect(safeFileName("x".repeat(300))).toHaveLength(200);
});

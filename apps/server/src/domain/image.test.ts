import { expect, test } from "vitest";
import { imageType } from "./image.ts";

const bytes = (...parts: (string | number[])[]) =>
  Uint8Array.from(parts.flatMap((part) => (typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : part)));

test("recognises allowed image types by content", () => {
  expect(imageType(bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a], "rest"))).toBe("image/png");
  expect(imageType(bytes([0xff, 0xd8, 0xff, 0xe0], "JFIF"))).toBe("image/jpeg");
  expect(imageType(bytes("GIF89a..."))).toBe("image/gif");
  expect(imageType(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toBe("image/webp");
});

test("rejects everything else, including SVG and HTML", () => {
  expect(imageType(bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>'))).toBeNull();
  expect(imageType(bytes("<!doctype html>"))).toBeNull();
  expect(imageType(bytes("RIFF", [0, 0, 0, 0], "WAVE"))).toBeNull();
  expect(imageType(bytes([0x89], "PN"))).toBeNull();
  expect(imageType(new Uint8Array())).toBeNull();
});

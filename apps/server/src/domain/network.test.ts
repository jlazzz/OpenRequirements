import { expect, test } from "vitest";
import { isPrivateAddress } from "./network.ts";

test("internal addresses are private, public ones are not", () => {
  for (const ip of [
    "10.1.2.3",
    "127.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
  ])
    expect(isPrivateAddress(ip), ip).toBe(true);
  for (const ip of ["100.64.0.1", "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:10.0.0.1", "::ffff:7f00:1"])
    expect(isPrivateAddress(ip), ip).toBe(true);
  for (const ip of ["8.8.8.8", "172.32.0.1", "192.169.0.1", "1.1.1.1", "2606:4700::1111", "::ffff:8.8.8.8"])
    expect(isPrivateAddress(ip), ip).toBe(false);
  expect(isPrivateAddress("not an ip")).toBe(true);
});

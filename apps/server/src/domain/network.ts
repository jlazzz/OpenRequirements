import { isIPv4, isIPv6 } from "node:net";

const v4 = (ip: string) => ip.split(".").map(Number) as [number, number, number, number];

/**
 * Whether an IP address is on a private, loopback, link-local or otherwise internal network. Webhooks and connections
 * refuse such addresses unless ALLOW_PRIVATE_URLS is set, so a project admin cannot make the server call inside its own network.
 */
export function isPrivateAddress(ip: string): boolean {
  if (isIPv4(ip)) {
    const [a, b] = v4(ip);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (!isIPv6(ip)) return true;
  const lower = ip.toLowerCase();
  // An IPv4 address written as IPv6, e.g. ::ffff:127.0.0.1.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower)?.[1];
  if (mapped) return isPrivateAddress(mapped);
  return (
    lower === "::" ||
    lower === "::1" ||
    /^f[cd]/.test(lower) ||
    /^fe[89ab]/.test(lower) ||
    lower.startsWith("ff") ||
    lower.startsWith("::ffff:")
  );
}

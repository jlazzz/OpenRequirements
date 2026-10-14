import { lookup } from "node:dns/promises";
import { isPrivateAddress } from "./domain/network.ts";

/** Runs `task` every `everyMs`, never twice at once. Errors go to `log`. Returns a stop function. */
export function startLoop(task: () => Promise<unknown>, log: (error: unknown) => void, everyMs: number) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await task();
    } catch (error) {
      log(error);
    } finally {
      running = false;
    }
  }, everyMs);
  return () => clearInterval(timer);
}

/** Why a URL may not be called: not http(s), or (unless private addresses are allowed) it resolves to an internal network. */
export async function urlRefusal(url: string, allowPrivate: boolean): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "not a URL";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "only http and https addresses can be called";
  if (allowPrivate) return null;
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) return `${host} cannot be found`;
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    return `${host} is on a private network. The server administrator can allow that with ALLOW_PRIVATE_URLS=true`;
  }
  return null;
}

/**
 * Calls another server for a webhook or a connection. Refuses internal addresses, never follows a redirect (it could
 * lead inside), and gives up after ten seconds.
 * shortcut: the address is checked, then looked up again by fetch, so DNS that changes in between gets through; pin the
 * checked address with a custom agent if that matters.
 */
export async function outboundFetch(url: string, init: RequestInit, allowPrivate: boolean): Promise<Response> {
  const refusal = await urlRefusal(url, allowPrivate);
  if (refusal) throw new Error(refusal);
  return fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(10_000) });
}

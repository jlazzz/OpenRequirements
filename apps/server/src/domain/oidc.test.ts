import { expect, test } from "vitest";
import { idTokenClaims, idTokenError, pkceChallenge } from "./oidc.ts";

const now = new Date("2026-10-14T12:00:00Z");
const seconds = now.getTime() / 1000;
const expected = { issuer: "https://idp.example.com", clientId: "app", nonce: "n1", now };
const good = { iss: "https://idp.example.com", aud: "app", exp: seconds + 300, nonce: "n1", auth_time: seconds - 10 };
const jwt = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

test("an ID token is read and its claims are checked", () => {
  expect(idTokenClaims(jwt(good))).toEqual(good);
  expect(idTokenClaims("nonsense")).toBeNull();
  expect(idTokenError(good, expected)).toBeNull();
  expect(idTokenError({ ...good, aud: ["app", "other"], azp: "app" }, expected)).toBeNull();
  expect(idTokenError(null, expected)).toMatch(/cannot be read/);
  expect(idTokenError({ ...good, iss: "https://evil" }, expected)).toMatch(/issuer/);
  expect(idTokenError({ ...good, aud: "other" }, expected)).toMatch(/client/);
  expect(idTokenError({ ...good, aud: ["app", "other"] }, expected)).toMatch(/client/);
  expect(idTokenError({ ...good, exp: seconds - 120 }, expected)).toMatch(/expired/);
  expect(idTokenError({ ...good, nonce: "n2" }, expected)).toMatch(/this sign-in/);
});

test("signing again needs a fresh sign-in at the provider", () => {
  expect(idTokenError(good, { ...expected, authAfter: new Date(now.getTime() - 30_000) })).toBeNull();
  expect(idTokenError(good, { ...expected, authAfter: new Date(now.getTime() + 120_000) })).toMatch(/password/);
  expect(idTokenError({ ...good, auth_time: undefined }, { ...expected, authAfter: now })).toMatch(/password/);
});

test("the PKCE challenge is the RFC 7636 example", () => {
  expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});

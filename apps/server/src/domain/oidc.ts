import { createHash, randomBytes } from "node:crypto";

/** A random value for state, nonce and the PKCE verifier. */
export const randomValue = () => randomBytes(32).toString("base64url");

/** The PKCE challenge sent to the identity provider for a verifier kept by the server. */
export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/** The claims of an ID token. Its signature is not checked: the token came straight from the provider over HTTPS. */
export function idTokenClaims(token: string): Record<string, unknown> | null {
  try {
    const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    return claims && typeof claims === "object" ? claims : null;
  } catch {
    return null;
  }
}

/**
 * Checks an ID token's claims as OpenID Connect Core 3.1.3.7 asks of a token received straight from the token endpoint.
 * `authAfter` is set when the person had to sign in again (to sign a review): the provider must say they did.
 * Returns what is wrong, or null.
 */
export function idTokenError(
  claims: Record<string, unknown> | null,
  expected: { issuer: string; clientId: string; nonce: string; now: Date; authAfter?: Date },
): string | null {
  if (!claims) return "the ID token cannot be read";
  if (claims.iss !== expected.issuer) return "the ID token is from another issuer";
  const audience = [claims.aud].flat();
  if (!audience.includes(expected.clientId)) return "the ID token is for another client";
  if (audience.length > 1 && claims.azp !== expected.clientId) return "the ID token is for another client";
  const seconds = expected.now.getTime() / 1000;
  if (typeof claims.exp !== "number" || claims.exp < seconds - 60) return "the ID token has expired";
  if (claims.nonce !== expected.nonce) return "the ID token does not answer this sign-in";
  if (expected.authAfter) {
    // A minute of leeway for clocks that differ.
    if (typeof claims.auth_time !== "number" || claims.auth_time < expected.authAfter.getTime() / 1000 - 60) {
      return "the identity provider did not ask for the password again";
    }
  }
  return null;
}

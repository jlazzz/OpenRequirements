import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyReply } from "fastify";
import type { AppContext } from "./app.ts";
import { sessions, users } from "./db/schema.ts";
import { idTokenClaims, idTokenError, pkceChallenge, randomValue } from "./domain/oidc.ts";
import { NO_PASSWORD } from "./domain/password.ts";

/** Sign-in through an OpenID Connect identity provider, from OIDC_* environment variables. */
export type OidcConfig = { issuer: string; clientId: string; clientSecret: string; name: string };

type Discovery = { issuer: string; authorization_endpoint: string; token_endpoint: string; userinfo_endpoint?: string };
/** What the browser carries from the start of a sign-in to its callback, in a short-lived cookie. */
type Pending = { state: string; nonce: string; verifier: string; returnTo: string; at: number; session?: string };

const COOKIE = "oidc";
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
/** Only a path on this site: never another site, so the callback cannot be used to send people elsewhere. */
const safePath = (path: unknown) => (typeof path === "string" && /^\/(?![/\\])/.test(path) ? path : "/");

/**
 * OpenID Connect, authorization code flow with PKCE, written on fetch with no library (ADR 0016). The first sign-in makes
 * the account, matched by verified email to an existing one. An approver without a password signs a review by
 * signing in again at the provider: the callback marks their session, and the sign route accepts that once.
 */
export function oidcRoutes(
  { app, db, requireUser, requireSession, audit, startSession, mail, https }: AppContext,
  oidc: OidcConfig,
) {
  const issuer = oidc.issuer.replace(/\/$/, "");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(issuer).hostname);
  if (new URL(issuer).protocol !== "https:" && !local) throw new Error("OIDC_ISSUER must be an https address");
  const redirectUri = `${mail.publicUrl}/api/oidc/callback`;

  let discovery: Promise<Discovery> | null = null;
  const discover = () => {
    discovery ??= fetch(`${issuer}/.well-known/openid-configuration`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`the identity provider answered ${res.status}`);
        const found = (await res.json()) as Discovery;
        if (found.issuer.replace(/\/$/, "") !== issuer) throw new Error("the identity provider names another issuer");
        return found;
      })
      .catch((error) => {
        discovery = null;
        throw error;
      });
    return discovery;
  };

  async function begin(reply: FastifyReply, returnTo: unknown, session?: string) {
    const config = await discover();
    const pending: Pending = {
      state: randomValue(),
      nonce: randomValue(),
      verifier: randomValue(),
      returnTo: safePath(returnTo),
      at: Date.now(),
      session,
    };
    // Lax, not strict: the provider sends the browser back here from its own site.
    reply.setCookie(COOKIE, Buffer.from(JSON.stringify(pending)).toString("base64url"), {
      path: "/api/oidc",
      httpOnly: true,
      sameSite: "lax",
      secure: https,
      maxAge: 600,
    });
    const url = new URL(config.authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: oidc.clientId,
      redirect_uri: redirectUri,
      scope: "openid email profile",
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: pkceChallenge(pending.verifier),
      code_challenge_method: "S256",
      // Signing: the provider must ask for the password again, and say when it did.
      ...(session ? { prompt: "login", max_age: "0" } : {}),
    }).toString();
    return reply.redirect(url.toString());
  }

  const returnQuery = {
    type: "object",
    additionalProperties: false,
    properties: { returnTo: { type: "string", maxLength: 500 } },
  } as const;

  app.get("/api/oidc/login", { config: { public: true }, schema: { querystring: returnQuery } }, async (req, reply) =>
    begin(reply, (req.query as { returnTo?: string }).returnTo),
  );

  // Confirms the signed-in person at the provider again, so they can sign a review without a password.
  app.get(
    "/api/oidc/reauth",
    { onRequest: [requireUser, requireSession], schema: { querystring: returnQuery } },
    async (req, reply) =>
      begin(reply, (req.query as { returnTo?: string }).returnTo, hashToken(req.cookies.session ?? "")),
  );

  app.get(
    "/api/oidc/callback",
    {
      config: { public: true },
      schema: {
        querystring: {
          type: "object",
          properties: {
            code: { type: "string", maxLength: 4000 },
            state: { type: "string", maxLength: 500 },
            error: { type: "string", maxLength: 200 },
            error_description: { type: "string", maxLength: 2000 },
          },
        },
      },
    },
    async (req, reply) => {
      const query = req.query as { code?: string; state?: string; error?: string; error_description?: string };
      const fail = (why: string) =>
        reply.code(400).type("text/plain; charset=utf-8").send(`Sign-in failed: ${why}.\n\nGo back and try again.`);
      let pending: Pending | null = null;
      try {
        pending = JSON.parse(Buffer.from(req.cookies[COOKIE] ?? "", "base64url").toString("utf8"));
      } catch {}
      reply.clearCookie(COOKIE, { path: "/api/oidc" });
      if (query.error) return fail(query.error_description ?? query.error);
      if (!pending || !query.state || pending.state !== query.state || !query.code) {
        return fail("the sign-in took too long or was started in another browser");
      }

      const config = await discover();
      const tokenRes = await fetch(config.token_endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Basic ${btoa(`${encodeURIComponent(oidc.clientId)}:${encodeURIComponent(oidc.clientSecret)}`)}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: query.code,
          redirect_uri: redirectUri,
          code_verifier: pending.verifier,
        }),
      });
      const tokens = (await tokenRes.json().catch(() => ({}))) as { id_token?: string; access_token?: string };
      if (!tokenRes.ok || !tokens.id_token) return fail("the identity provider did not give an ID token");
      const claims = idTokenClaims(tokens.id_token);
      const error = idTokenError(claims, {
        issuer: config.issuer,
        clientId: oidc.clientId,
        nonce: pending.nonce,
        now: new Date(),
        authAfter: pending.session ? new Date(pending.at) : undefined,
      });
      if (error || !claims) return fail(error ?? "no claims");

      let profile: Record<string, unknown> = claims;
      if (typeof claims.email !== "string" && config.userinfo_endpoint && tokens.access_token) {
        const info = await fetch(config.userinfo_endpoint, {
          headers: { authorization: `Bearer ${tokens.access_token}` },
        });
        const body = info.ok ? ((await info.json()) as Record<string, unknown>) : {};
        if (body.sub === claims.sub)
          profile = { ...body, ...claims, email: body.email, email_verified: body.email_verified };
      }
      const email = typeof profile.email === "string" ? profile.email.toLowerCase() : null;
      if (!email || (profile.email_verified !== true && profile.email_verified !== "true")) {
        return fail("the identity provider did not give a verified email address");
      }
      const [person] = await db.select().from(users).where(eq(users.email, email));
      if (person?.deactivatedAt) return fail("this account is deactivated");

      if (pending.session) {
        if (!person) return fail("this is not the person who is signed in");
        const [marked] = await db
          .update(sessions)
          .set({ reauthAt: new Date() })
          .where(and(eq(sessions.tokenHash, pending.session), eq(sessions.userId, person.id)))
          .returning({ userId: sessions.userId });
        if (!marked) return fail("this is not the person who is signed in");
        await audit(db, person.id, "session.reauth", "user", person.id);
        return reply.redirect(pending.returnTo);
      }

      await db.transaction(async (tx) => {
        let id = person?.id;
        if (!id) {
          const name =
            typeof profile.name === "string" && profile.name.trim() ? profile.name.trim().slice(0, 100) : email;
          const [created] = await tx
            .insert(users)
            .values({ email, name, passwordHash: NO_PASSWORD })
            .onConflictDoNothing()
            .returning({ id: users.id });
          // Someone made the same account a moment ago: use theirs.
          id = created?.id ?? (await tx.select({ id: users.id }).from(users).where(eq(users.email, email)))[0]?.id;
          if (!id) throw new Error("user insert returned no row");
          if (created) await audit(tx, id, "user.create", "user", id, { label: "single sign-on" });
        }
        await startSession(tx, reply, id);
      });
      return reply.redirect(pending.returnTo);
    },
  );
}

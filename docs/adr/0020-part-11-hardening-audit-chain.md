# 0020: Part 11 hardening: lockout, expiry, idle timeout and a tamper-evident audit log

Date: 2026-10-14
Status: Accepted

## Context

J1 slice 3 of the [roadmap](../ROADMAP.md). [ADR 0010](0010-reviews-approvals-and-signatures.md) listed what was missing for 21 CFR Part 11: no lockout, no password expiry, no inactivity timeout, and an audit log anyone with database access could rewrite unseen. Bundle K builds an anchored chain on top of the hash chain made here.

## Decisions

### Three sign-in limits, off unless set

Environment variables, read in `main.ts`, passed to `buildApp` as `security`. Zero or unset switches a rule off, so nothing changes for an existing install.

| Variable | Meaning |
|---|---|
| `LOGIN_LOCKOUT_ATTEMPTS` | Failed sign-ins in a row that lock the account |
| `LOGIN_LOCKOUT_MINUTES` | Length of the lock, default 15 |
| `PASSWORD_MAX_AGE_DAYS` | Days a password may be used |
| `SESSION_IDLE_MINUTES` | Minutes without a request before a session ends |

The rules are pure functions in `domain/accountsecurity.ts`.

- **Lockout.** `users.failed_logins` is incremented in SQL (so concurrent attempts count), and `users.locked_until` set at the limit. A locked account answers the same "Wrong email or password" as any failure, even for the right password, so the lock reveals nothing. A good sign-in or a password reset clears the count. With lockout on, each failure is audited (`user.login_failed`, `user.locked`). Failures for unknown emails are not recorded.
- **Expiry.** `users.password_changed_at` is set on every password change, reset and accepted invitation. Sign-in with an expired password answers 403 with `code: "password_expired"`; open sessions stop working too. The person uses "Forgot password" or an administrator's reset link; changing the password inside a session is not possible once it expired, by design. Accounts with no password (single sign-on) never expire.
- **Idle.** `sessions.last_seen_at` is refreshed at most once a minute. A session idle past the limit is deleted. API tokens are unaffected: they have their own expiry.

### Audit hash chain

`audit_events` gains `seq`, `prev_hash` and `hash`. Each row's hash is SHA-256 of the previous row's hash and the row's content (id, time, actor, project, action, entity, label and mentions in a fixed order, `domain/auditchain.ts`). `seq` counts 1, 2, 3 in the order written.

- **One writer at a time.** `audit()` takes `pg_advisory_xact_lock` before reading the last row and inserting, in a savepoint (or its own transaction when called with the plain database). The lock is released at the end of the caller's transaction, so rows are numbered in commit order and a rollback leaves no gap. The cost: every audited write serialises on that lock until its transaction ends. Writes here are short; if that changes, a per-instance sequence plus later hashing is the alternative. A deadlock is possible only if a transaction takes a row lock after its audit call that another transaction holds while waiting for the audit lock; Postgres aborts one with an error rather than hanging.
- **Millisecond time.** `at` is set in the application, not by the database default, so what is stored reads back exactly as hashed.
- **No backfill.** The migration adds nullable columns only. Rows from before it, and rows restored from a project backup, have no `seq`; verification counts them (`unchained`) and does not fail on them. A backfill would rewrite the whole table and prove nothing: the old rows were never protected.
- **Verifying.** `GET /api/audit/verify` (instance administrators) walks the chain in `seq` order, 1,000 rows a page, and returns `{ ok, checked, lastSeq, unchained, firstBroken }`. A break is a `sequence` gap (a row deleted or the start removed), a `link` (a row before it was rewritten and rehashed) or `content` (a row was changed). The Users page has a "Verify audit log" button.

## Limits

- Someone with write access to the database who rewrites every row from a point onward, rehashing as they go, is not detected. Deleting the newest rows is not detected either. Closing that needs the hash kept somewhere the database cannot change: roadmap A2 slice 1 (anchored audit chain).
- Rows restored from a backup are outside the chain.
- Lockout is per account, not per address, so someone can lock a known account out. The time window bounds the harm; the rate limit on `/api/login` is unchanged.
- Hashing uses the stored `data` shape; a future change to what an audit row holds must keep the hash input the same for old rows.

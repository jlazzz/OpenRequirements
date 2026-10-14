# 0024: Anchored audit chain

Date: 2026-10-14
Status: Accepted

## Context

[ADR 0020](0020-part-11-hardening-audit-chain.md) chains each audit row to the one before. Someone who can write to the database can still rewrite every row from a point onward, rehashing as they go, or delete the newest rows, and the chain verifies. Roadmap A2 slice 1.

## Decisions

- **Anchors.** `audit_anchors` (migration 0022) holds copies of the chain's head: position (`seq`), its hash, time, the previous anchor's hash, its own hash, and a signature. Anchors are chained to each other, so removing or editing one is seen. Rows are only inserted.
- **Signature.** HMAC-SHA256 of the anchor hash with `ANCHOR_KEY` (Node crypto, no dependency). The key lives in the environment, not the database. Without it anchors are hash-linked but unsigned, and the verify answer says `signed: false`. Changing the key makes older anchors fail the signature check; keep it.
- **When.** A loop in `main.ts` checks every 10 minutes and anchors when the last anchor is older than `ANCHOR_INTERVAL_HOURS` (default 24; 0 turns it off). An instance administrator can anchor at once (`POST /api/audit/anchors`, "Anchor now" on the Users page). Nothing is written when the chain head is already anchored. Each anchor is itself an audit event (`audit.anchor`), so a daily anchor always has one new row to cover.
- **Outside the database.** Two ways to keep a copy the database cannot alter: `ANCHOR_FILE` (each new anchor appended as one JSON line, ideally on another volume), and `GET /api/audit/anchors`, which the administrator downloads and stores elsewhere (email, ticket, ledger). The database's own table alone only detects an attacker who did not also edit it.
- **Verifying.** `GET /api/audit/verify` now also checks the stored anchors against the live rows and returns `anchors: { checked, signed, firstBad }`; `ok` needs both. `firstBad.reason`: `anchor_chain` (anchors changed or removed), `signature`, `truncated` (the anchored row no longer exists: newest rows deleted), `rewritten` (the row at that position has another hash: history rewritten). `POST /api/audit/anchors/verify` takes a saved copy and checks it the same way, and lists in `missing` anchors the database no longer holds, which is how a wholesale `delete from audit_anchors` shows.
- **Concurrency.** Anchoring takes its own advisory lock, not the audit lock, and reads the committed head, so audited writes are not slowed. The anchor's audit row takes the audit lock briefly like any write.
- **Backup.** Anchors are instance-wide and not in a project backup. A restore inserts events without `seq` (as ADR 0020 already says), so it neither extends nor breaks the chain, and anchors stay valid.

## Limits

- An attacker with database write access and the environment (key and file) can forge anchors. Keep the downloaded copy off the host.
- Between anchors (24 hours by default) the newest rows are not covered; shorten the interval to narrow that.
- The anchor table itself is not guarded by a database trigger.

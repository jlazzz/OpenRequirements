# 0010: Reviews, approvals and electronic signatures

Date: 2026-10-13
Status: Accepted

## Context

The outline placed review workflows and electronic signatures in Phase 3. The owner asked for them now, and answered four product questions before the build: how an approval writes Status, how the outcome is decided, when the password is asked for, and who may take part.

## Decisions

### A review is held on a baseline

A review points at one baseline and covers every item in it. Reviewers see the frozen versions, so the content cannot change under them. Nothing about the items is copied: the review reads the baseline.

### Participants and roles

An Editor or Admin creates and closes a review. The creator picks reviewers and approvers from people with the project role Reviewer or higher. An approver can do everything a reviewer can. The creator may be an approver. Participants are fixed at creation.

### Marks are append-only

`review_marks` holds one row per person, item and click: reviewed, approved, rejected, or cleared. A person's latest row per item counts. Nothing is updated or deleted. Review comments are ordinary item comments with a `review_id`; they also show on the live item, tagged with the review's name.

### The outcome rule is a pure module

`apps/server/src/domain/review.ts`:

- An item is **approved** when every approver approved it, **rejected** if any approver rejected it, otherwise undecided.
- When a review is closed: with no approvers, or before every approver signed, it is **closed** (no decision). Otherwise it is **approved** when every item is approved, and **rejected** if not.

The state is worked out once, at closing, and stored on the review. After closing, marks, comments and signatures are refused, and a review comment cannot be deleted.

### Electronic signature

An approver decides every item, then signs once with their password. The signature covers all their decisions and makes them final.

- **Re-authentication:** the password is checked again. A request made with an access token is refused, and the route is rate-limited. A failed attempt is audited.
- **Meaning:** "approval" when the signer approved every item, "rejection" otherwise. It is stored and shown.
- **Manifestation:** the signer's name and email are copied onto the signature with the time, so it reads the same if the account is renamed.
- **Link to the record:** the signature stores a SHA-256 digest of the review name, baseline name, signer, meaning, time, and each item's UID, version and decision. The digest is worked out again whenever the review is read; a mismatch is shown as "Record changed after signing". It uses names and UIDs, not database ids, so it still checks out after a backup is restored.

### Approval can set Status, and a Status-only version has no side effects

Closing an approved review can write Status = Approved to its items, as a new version of each with the reason `Approved in review "…"`. An item that was edited or deleted since the baseline is skipped and reported: nobody approved its current text. A rejected or undecided review writes nothing.

A new version normally makes relationships suspect and test results out of date. That would make every approval flood both. So `item_revisions.status_only` is set when a version says the same as the one before it apart from the Status field, whether a review wrote it or a person did. The suspect rule and the verification rule skip such versions. The flag is set once, when the version is saved, and never changes. Versions saved before this ADR keep the old behaviour.

The Status field is found by its name, "Status", like "Verified by" in ADR 0009.

### What 21 CFR Part 11 still needs

Built: signature manifestation (§11.50), signature/record linking (§11.70), two-component signing by session plus password (§11.200(a)), unique never-reused accounts (§11.100(a)), audit trail (§11.10(e)).

Not built, on purpose for now:

- Password expiry, lockout after failed attempts with a notice to an administrator, inactivity timeout (§11.300).
- A signed export of a review for inspectors (§11.10(b)). Browser print is the stand-in.
- A tamper-evident audit log. A database administrator can still alter rows; the digest catches changes to signed decisions only.
- A validation pack (§11.10(a)).
- HTTPS, already on the list and required before a real signature.

Identity checks, the letter to the FDA (§11.100(c)), training and retention are the customer's procedures. The tool supports Part 11; it does not make an installation compliant by itself.

## Consequences

- Backup format version 4 adds reviews, participants, marks, signatures, `itemRevisions.statusOnly` and `comments.reviewId`. Older files still restore.
- A test result is recorded against the newest version of a test case, but judged against the newest version that changed more than Status.
- Approving an item someone else is editing makes their draft stale: their save is refused with "reload", as for any newer version.
- Each mark and each updated item is audited, but hidden from the activity stream, which shows one line per review event.

# 0023. Review participants over time, and the In review status

Date: 2026-10-14. Status: accepted. Extends [ADR 0010](0010-reviews-approvals-and-signatures.md).

## Decision

- **Participants change while a review is open.** `review_participants` gets its own `id`, `addedAt`, `addedBy`, `removedAt` and `removedBy`. Removing sets `removedAt`; the row is never deleted. A partial unique index allows one active row per person and review, so taking part again is a new row. Only an Editor or Admin may change participants, and a closed review cannot be changed.
- **What stays.** An approver who has signed cannot be removed (their signature covers their decisions), and the last participant cannot be removed. Rules are pure functions in `domain/review.ts`.
- **What a removed person leaves behind.** Their marks and comments stay in the tables. The review reads only active participants' marks, so a removed approver no longer blocks closing and a removed reviewer's "reviewed" no longer shows.
- **Opening sets Status to "In review"** on each reviewed item whose type has that option, as a version marked `statusOnly`, so no relationship goes suspect and no result goes out of date. An item already Approved or already In review is not touched; an item edited since the baseline is skipped, as at closing.
- **Closing still approves.** "Still what was reviewed" now means every version after the baseline's only changed Status (`stillReviewed`), otherwise the version written at opening would make every item look edited.
- **My reviews**: `GET /api/reviews/mine` lists open reviews the signed-in person actively takes part in, across projects.

## Consequences

- Backup format version 10. Older files restore, with every listed participant treated as present from the start.
- A review closed as "closed" or "rejected" leaves items at "In review". Nothing puts them back; the owner can set Status by hand or in bulk.
- A person added later is notified like the first ones (J1 slice 2). Removal is not notified.

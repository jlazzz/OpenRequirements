# Reviews, approvals and signatures

A review is held on a baseline, so what people review cannot change while they review it.

## Start a review (Editor or Admin)

1. Create a baseline of the set or project under **Baselines**.
2. Open **Reviews** and fill in **New review**: a name, the baseline, reviewers and approvers.
3. Choose **Start review**.

Reviewers and approvers must have the project role Reviewer or higher.

Starting the review sets **Status** to **In review** on each item that has that option, as a new version that only changes Status. Items already Approved, and items edited after the baseline, are left alone.

## Change who takes part (Editor or Admin)

While the review is open, the people table has **Remove** on each row and **Add a person** under it.

- A removed person's marks and comments stay, but their marks stop counting and they can no longer mark or sign.
- An approver who has signed cannot be removed: their signature stands. The last person cannot be removed.
- Adding a person who was removed gives them a fresh start.
- A closed review cannot be changed.

## My reviews

The home page lists every open review you take part in, in all projects, with your part.

## Review (reviewers and approvers)

1. Open the review. Select an item's ID to read it as the baseline froze it.
2. Write comments in that window. They also appear on the live item, marked with the review's name.
3. A reviewer ticks **Reviewed** on each item.

## Approve and sign (approvers)

1. Choose **Approve** or **Reject** on each item. **Approve all remaining** fills in the rest.
2. Choose **Sign and submit** and enter your password.

Your signature covers all your decisions. Its meaning is **Approval** if you approved every item, and **Rejection** otherwise. After signing you cannot change your decisions.

## Who is told

Notifications (the bell, and email if the person chose it):

- Someone is invited, at the start or when added later.
- The person who started the review hears when every approver has signed.
- Everyone in the review, and its starter, hears when it is closed and how.

Nobody is told of their own action.

## Close the review (Editor or Admin)

Choose **Close review**. The state is decided at that moment and is permanent:

| State | When |
|---|---|
| Approved | Every approver signed, and every item was approved by every approver |
| Rejected | Every approver signed, and at least one item was rejected |
| Closed | There are no approvers, or not every approver signed |

For an approved review you can tick **Set Status to Approved on the reviewed items**. Each item gets a new version with Status = Approved. An item that was edited or deleted after the baseline is skipped and listed, because nobody approved its current text.

A version that only changes Status does not make relationships suspect and does not put test results out of date.

## The record

A closed review keeps who marked, decided and signed what, and when. **Print or save as PDF** gives a copy with the signatures. **Word record (.docx)**, on a closed review, downloads a document with a signature block (who signed, the meaning, when, and whether the record is intact) and each item's version and outcome.

If a signed decision is altered in the database afterwards, the signature shows **Record changed after signing**.

## 21 CFR Part 11

The tool stores the signer's name, the time and the meaning of each signature, asks for the password again, and ties the signature to what was signed. It does not yet have password expiry, lockout, or an inactivity timeout, and it needs HTTPS in front of it. Compliance also needs your own validation and procedures. See [ADR 0010](../adr/0010-reviews-approvals-and-signatures.md).

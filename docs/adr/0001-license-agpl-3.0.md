# 0001: License is AGPL-3.0 with a CLA

Date: 2026-10-12
Status: Accepted

## Context

The project is open source, self-hosted first, with a possible hosted offering and commercial licenses later (outline section 9). The options were AGPL-3.0 + CLA or Apache-2.0.

## Decision

License the code under AGPL-3.0-only. Require a CLA from the first outside contribution.

## Why

- AGPL requires anyone running a modified copy as a service to publish their changes, which protects a future hosted offering.
- A CLA keeps the right to relicense, so moving to Apache-2.0 or selling commercial licenses stays possible. The reverse move, from Apache to a stricter license, is much harder.
- Small teams self-hosting an unmodified copy have no real AGPL obligations.

## Consequences

- Some companies ban AGPL. A commercial license is the answer for them.
- The license can be changed freely while there is a single copyright holder. After outside contributions it can be changed only if every contributor signed the CLA.
- Versions already released under AGPL stay available under AGPL.
- `CLA.md` and a signing step must exist before the first outside pull request is merged. Have a lawyer check the CLA text.

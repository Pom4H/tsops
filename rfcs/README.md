# tsops RFCs

Substantive changes to tsops — public API, file formats, the orchestrator
contract, or anything that's hard to roll back — go through an RFC before
implementation lands.

## Process

1. Copy `0000-template.md` to `rfcs/NNNN-short-name.md`.
2. Fill in the sections. Be honest about drawbacks and alternatives — an RFC
   that only argues one side gets sent back.
3. Open a PR. The PR description should link any related issues.
4. Discussion happens in the PR. Push commits to update the RFC text in
   response to review.
5. The RFC is **accepted** when a maintainer merges the PR. Status moves to
   `Accepted` and the PR number is recorded in the doc.
6. Implementation tracking happens in a separate issue, not in the RFC text.

## States

- **Draft** — open for discussion.
- **Accepted** — merged; implementation may begin.
- **Implemented** — landed in a release; RFC becomes historical reference.
- **Rejected** — closed without merging. Kept in `rfcs/rejected/` if the
  discussion is useful for posterity.
- **Superseded by NNNN** — replaced by a later RFC.

## Index

| #    | Title                                      | Status |
|------|--------------------------------------------|--------|
| 0001 | Platform abstraction for non-Kubernetes targets | Draft  |

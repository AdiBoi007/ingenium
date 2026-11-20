# Universal guest demo launch record

Deployed and verified: 18 November 2026. Public site and database health rechecked: 20 November 2026. This document tracks the universal guest/cloud followup. [The earlier verification record](verification.md) remains unchanged as evidence for the previous local sample milestone; its counts and external-service limitations describe that earlier state.

## Implemented scope

- Private no-sign-in browser workspaces by default (`DEMO_MODE=false`), opaque database-backed sessions and project ownership checks. New guests start with no projects or sample learning history. Local `DEMO_MODE=true` retains the synthetic sample fixture; Vercel deployments never expose it as the current guest identity.
- Universal course, exam, school, personal and custom project kinds; institution, course code, qualification/board, level, academic session, subjects and learning goals. The editable INFO1110 programming example makes no official syllabus claim.
- Plain-text syllabus outline import, additive topic updates and preservation of historical attempts/coverage when metadata changes. Original supported questions, simulations and scoring remain explicitly bounded educational tools.
- Direct YouTube URL import with oEmbed metadata, supported embedded playback, durable project-scoped history/resume state, notes and collections. Data API search and paginated playlist preview/import are implemented behind an optional server key.
- Migrated Neon cloud PostgreSQL and the private Vercel Blob adapter. Hosted uploads use `MAX_UPLOAD_MB=3`.

## Evidence available at this checkpoint

| Check                         | Recorded result                                   | Boundary                                                                                                                                        |
| ----------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Combined Vitest suite         | 87 tests passed in 10 files                       | Includes database, identity, universal project, storage and injected-provider checks. This is not live OpenAI or YouTube Data API verification. |
| Earlier new browser journeys  | Six new browser cases passed across targeted runs | Universal project and YouTube UI flows; final combined source/build runs are recorded below.                                                    |
| Universal project screenshots | `output/screenshots/universal-*`                  | Actual desktop INFO1110 and mobile school renders from temporary verification projects.                                                         |
| Neon schema                   | Cloud migrations applied                          | Does not alone establish deployed browser behavior.                                                                                             |
| Private Vercel Blob           | Live provider write/read byte roundtrip passed    | Distinct from the deployed guest upload/extraction/read journey.                                                                                |
| OpenAI                        | Key missing at this checkpoint                    | Deterministic tools and saved messages remain usable; no live tutoring response claimed.                                                        |
| YouTube Data API              | Key not yet configured at this checkpoint         | Direct URL/oEmbed import remains available. Search/playlist provider fixtures do not establish live quota/key access.                           |

## Final verification and deployment evidence

The tested production build was promoted to the public demo. The repository is an uncommitted local source workspace; this release was uploaded with the authenticated Vercel CLI, not deployed from a Git commit. Evidence files are `output/hosted-api-smoke.json` and `output/screenshots/universal-guest-hosted-report.json`.

| Check                                       | Final result                                                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Local production build and TypeScript       | Passed                                                                                                                  |
| ESLint                                      | Passed, clean                                                                                                           |
| Final Vitest count                          | 87 passed in 10 files                                                                                                   |
| Sample-mode production browser suite        | 25 passed; 1 private-guest case intentionally skipped                                                                   |
| Separate guest-mode production browser test | 1 passed; combined with the sample run, 26 scenarios passed overall                                                     |
| Deployed guest isolation and persistence    | Passed: 29 hosted API checks across staged builds, plus the guest browser journey on the promoted public URL            |
| Deployed private upload/read/extraction     | Passed: original text extracted and exact bytes retrieved; another guest received 404                                   |
| Live YouTube search/playlist key smoke      | Pending credential availability and explicit verification                                                               |
| Live OpenAI response                        | Not configured                                                                                                          |
| Promoted Vercel deployment                  | READY: `dpl_8ddM6S6z5ztJuZtM1gcoHpzJpiDh`                                                                               |
| Production URL                              | https://ingenium-seven-jet.vercel.app                                                                                   |
| Hosted visual checks                        | Four desktop/mobile screenshots; no overflow or page errors; dark Progress button contrast 6.28:1                       |
| Runtime log scan at deployment              | Zero HTTP 500 entries; pg8 emitted a future-major SSL semantics warning, not an application failure                     |
| 20 November availability check              | `/projects`, `/api/health` and `/api/capabilities` returned 200; database connected, guest mode and private Blob active |
| Custom-domain changes                       | None; ingenx0.com was not modified                                                                                      |

For guest browser verification, start an isolated local test instance with `DEMO_MODE=false` and run `tests/e2e/guest-workspace.spec.ts` with `GUEST_WORKSPACE_TEST=true` and its `PLAYWRIGHT_BASE_URL`. The shared sample suite uses a separate `DEMO_MODE=true` instance. Do not run destructive local fixtures against the cloud database. See [README verification commands](../README.md#verification).

## Honest release boundaries

This is a browser guest demo, not an implemented account/sign-in/recovery system. Access depends on the session cookie; cross-device account linking and recovery are not present. Complete verified official syllabi, official/adaptive exam scoring, OCR, transcript ingestion, live official notice feeds, external calendar synchronization, outbound notifications and payment collection remain outside the implemented scope. Embedded video availability remains controlled by YouTube. Provider credentials and storage connectivity must not be described as a completed deployed end-to-end check without the evidence above.

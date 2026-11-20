# Verification record

Verified locally on 18 November 2026 with Node 26.5, PostgreSQL, Next.js 16.4.6, and Playwright using installed Google Chrome. No production deployment was made.

## Completed checks

- `npm run build`: passed, including the production TypeScript check.
- `npm run typecheck`: passed.
- `npm run lint`: passed without warnings on the final source.
- `npm test`: **64 tests passed in 7 files**. This includes real PostgreSQL integration tests, original-question answer checks, scientific models, grading, curriculum changes, local storage, and an explicitly mocked AI provider.
- **19 unique browser acceptance journeys passed across production runs.** The initial complete run passed 17 cases; its remaining case had a test selector that incorrectly matched Next's route announcer. The selector was scoped to the actual in-page error. The final targeted run passed that case, a new written-response scoring case, and the five affected learning journeys: 7/7. The two runs cover the current 19-case suite. There is no claim that the original complete run passed without that correction.
- Production restart persistence: created a separate test project, note, completed task and preferences; reran the idempotent seed; stopped development; built and started production; read back and asserted all four records. Removed the test project afterwards.
- Migrations applied and rerun safely. The seed preserves existing student changes and its original date anchor. Four synthetic projects remain after test cleanup.

The browser checks cover all six main workspaces in all four seeded projects; desktop and phone layouts; light/dark appearance; keyboard menu focus; project creation and preferences; offline conversation saves and failed-request draft recovery; source upload, replacement, historical deleted-source citations; notes; lesson notes and collection ordering; calendar task completion; planner preview/apply/undo; practice, flashcards, saved labs, all twelve lab scenes; curriculum mapping and assessment weights; timed-test resume, expiry, autosave failure, session switching, result-to-question matching and written-response self-review.

Supporting pages were also inspected at 1440, 390 and 360px in both themes; learning tools at 768, 390 and 360px. No horizontal overflow or unexpected page errors were observed in those checks. Reduced-motion styling, native modal focus containment/return, labelled controls, and visible keyboard focus are implemented. This is targeted accessibility verification, not an independent WCAG certification.

## Screenshots

Screenshots are actual browser renders, stored in `output/screenshots/`:

- `overview-desktop.png`, `overview-mobile.png`
- `study-desktop.png`, `study-mobile.png`, `study-dark-mobile.png`
- `cramazon-desktop.png`, `cramazon-mobile.png`
- `library-desktop.png`, `library-mobile.png`
- `calendar-desktop.png`, `calendar-mobile.png`
- `progress-desktop.png`, `progress-mobile.png`
- `composer-menu-mobile.png`
- `learning-lab-desktop.png`, `learning-lab-mobile.png`
- `learning-practice-desktop.png`, `learning-practice-mobile.png`
- `learning-test-result-desktop.png`, `learning-flashcards-mobile.png`
- `learning-assessments-desktop.png`, `learning-syllabus-mobile.png`, `learning-circuit-desktop.png`

Some learning screenshots show temporary synthetic verification projects which were subsequently removed. Full-page mobile screenshots include the viewport-fixed navigation at the capture's initial scroll position.

## Dependency check and external boundaries

`npm audit --omit=dev` reported **0 runtime vulnerabilities**. The full development-tree audit reported 16 high entries propagated from the same `picomatch` ReDoS advisory, GHSA-fc5q-39xc-vjpf. The installed published release was still in its affected range; the proposed automatic change involved downgrading other tooling. No forced downgrade was applied. Recheck tooling updates before processing untrusted glob patterns in developer tooling.

No live OpenAI key or S3 bucket was configured or called. AI streaming, scoped tool dispatch, retry and usage accounting are exercised with an explicit provider fixture; real-provider output remains an external smoke test. Local file bytes and version history are verified. The S3 implementation still requires a real-bucket smoke test before hosting.

YouTube video identity metadata was checked and supported player-event wiring is implemented. Live video playback/duration persistence itself was not verified through an actual playback session. Timestamped note and collection persistence were verified. OCR, transcript ingestion, video search, official-update feeds, external calendar synchronization and outbound notifications are not connected. Manual transcription, saved lessons, official source links, local calendar and in-app notices provide the corresponding available paths. Official full-syllabus equivalence and official-format exam scoring are not claimed.

The development and production servers used for verification are stopped at handoff. Start locally with `npm run dev`, or `npm start` to run the verified production build. The configured database remains available; application shutdown does not delete data.

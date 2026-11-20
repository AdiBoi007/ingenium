# Ingenium

A learning workspace for any school subject, college course, examination or personal interest, built with Next.js App Router, React, TypeScript and PostgreSQL. Each browser starts a private guest workspace without a sign-in screen. Projects hold their own sources, conversations, notes, questions, study plans and progress. OpenAI and YouTube search are optional server-side integrations.

**Live demo:** [ingenium-seven-jet.vercel.app](https://ingenium-seven-jet.vercel.app). No sign-in is required. The public site and database health were rechecked on 20 November 2026. Live AI tutoring and YouTube Data API search/playlist import still require their server keys; direct YouTube links and supported playback are available.

## Start locally

Requirements: Node.js 22 or newer, npm, and PostgreSQL 14 or newer. Docker Compose is included for an isolated PostgreSQL database.

```sh
npm ci
cp .env.example .env
docker compose up -d
npm run db:migrate
npm run dev
```

Open `http://localhost:3000/projects`. With the default `DEMO_MODE=false`, a new browser receives an empty workspace and can create its first project immediately. No sample project, attempt, grade or viewing history is copied into it. Update the display name through the workspace profile.

An existing development PostgreSQL server can be used instead: create an isolated `ingenium_demo` database and set `DATABASE_URL` in `.env` before migrating. `.env` is ignored and must never be committed. Use a dedicated local test database for the test commands below; do not point them at the hosted Neon database.

For the reference design and sample learning material, seed the local database and explicitly start in sample mode:

```sh
npm run db:seed
DEMO_MODE=true npm run dev
```

Then open `/projects/jee-2027`. Local sample mode uses the shared synthetic `Adi — demo` identity and four existing projects. It is a development fixture, separate from private guest mode. Hosted Vercel deployments never enable this shared identity, even if `DEMO_MODE=true` is set accidentally. The normal seed is idempotent: it preserves student changes and its original sample date, anchored to the first seed in `Australia/Sydney`.

```sh
npm run build
npm start
```

For recoverable upload extraction, a worker is available:

```sh
npx tsx scripts/db-worker.ts
# Process the current queue once:
npx tsx scripts/db-worker.ts --once
```

Uploads normally extract in the upload request. Their bytes, source version and queued job are committed before extraction begins. The worker recovers queued/interrupted jobs after an interrupted request. A processing lease older than five minutes is marked interrupted. Scanned PDFs and images explicitly require a manual transcription because OCR is not configured.

## Projects for any learning context

Project creation offers `course`, `exam`, `school`, `personal` and `custom` kinds. Choose an optional starting template, or keep the blank project. Names, subjects, institution, course code, qualification/exam board, level, academic year/session and learning goals remain editable. School and university projects do not impose science subjects. Examples include INFO1110 programming, Grade 12 with a chosen board, A-level humanities, JEE and an independent interest.

The INFO1110 preset is an editable programming example with institution/code labels, not a verified University of Sydney syllabus. A project can import a TXT/Markdown topic outline using one topic per line or `Subject | Topic`. Imported topics begin unstudied; they create no practice questions or grades. Saving a changed outline adds new topics and preserves existing coverage and activity. Upload source PDFs through Library rather than treating arbitrary PDF prose as an automatically parsed curriculum. [Curriculum behavior and API](docs/curriculum.md) describes coverage, version mapping and course assessment weights.

Guest access uses an opaque, HttpOnly, SameSite cookie backed by a hashed database session token. Project APIs verify ownership against that session. The current session lasts 180 days; using the same browser profile keeps access across reloads and service restarts. Clearing the cookie, using another browser or letting the session expire creates a different workspace. Account sign-in, cross-device linking and account recovery are not implemented, so keep the browser session needed to reopen your work.

## Routes

| Route                                        | Workspace                                                     |
| -------------------------------------------- | ------------------------------------------------------------- |
| `/projects`                                  | Project collection, creation and lifecycle                    |
| `/projects/:projectId`                       | Project overview and contextual next steps                    |
| `/projects/:projectId/study`                 | Conversation, composer and deterministic tool entry points    |
| `/projects/:projectId/study/:conversationId` | Saved conversation                                            |
| `/projects/:projectId/cramazon`              | Project lessons and collections                               |
| `/projects/:projectId/cramazon/:lessonId`    | YouTube player and timestamped notes                          |
| `/projects/:projectId/library`               | Sources, notes and saved artifacts                            |
| `/projects/:projectId/library/:resourceId`   | Reader/editor and file access                                 |
| `/projects/:projectId/calendar`              | Tasks, recurring commitments, planning and ICS export         |
| `/projects/:projectId/progress`              | Attempts, syllabus, course assessments, mistakes and revision |
| `/projects/:projectId/settings`              | Learning context, syllabus outline, preferences and tools     |
| `/projects/:projectId/artifacts/:artifactId` | Saved interactive experiment                                  |
| `/projects/:projectId/tests/:sessionId`      | Persistent timed test and review                              |

## Local sample walkthrough

Use the seeded local `DEMO_MODE=true` fixture for this walkthrough. New guest projects start empty and use the same tools after the learner adds their own material.

1. Open JEE 2027 and check an item in Today’s plan. Its completion is saved in PostgreSQL and appears in Calendar.
2. Open Study, choose Visualise, change the projectile angle and save a variation. It reopens from Library with its exact input revision. The original ground-level reference case is 20 m/s, 30°, and gravity 10 m/s²: flight time 2 s, range about 34.641 m and maximum height 5 m.
3. Choose Practise, submit an incorrect answer, inspect its explanation and schedule revision. The attempt appears in Progress; the linked revision task appears in Calendar.
4. Create a custom timed test. Answer and flag a question, refresh, then submit. Its deadline comes from the server and its question and grading policy snapshots are retained. Repeated submission creates one result.
5. Create a note or upload an original text/PDF document in Library. Edit and save a note, then refresh. Replacing an uploaded file retains the old source version for historical references.
6. Preview a study plan, apply it, complete one task, then undo the plan. Undo removes only that plan’s pending tasks and preserves completed work.
7. Add a timestamped note in a lesson. The same note appears in Library. Watch position is saved from player events; manual completion remains separate from measured playback.
8. Switch projects. Conversations, questions, attempts, resources, playback and notes are scoped to the owning project.

## Database and storage

Versioned SQL migrations live in `database/migrations/`. The data layer is direct `pg` with parameterized SQL; there is one authoritative database and no browser-storage substitute for persistence. Transactional services are in `src/server/`.

The database has explicit relational tables for guest identities and sessions, request budgets, templates, project curricula/topics/prerequisites, reviewed curriculum changes, weighted course assessments, projects, conversations/messages, artifacts/revisions, resources/versions/chunks, questions/versions, test sessions/items, attempts, mistakes, flashcards/reviews, tasks/plans, lessons, focus sessions, notifications, learning events and jobs. Structured configuration and artifact inputs/results use JSONB. Book references and lesson collections use typed resources with metadata rather than a separate catalogue service.

Every project-owned record carries its project ID. APIs resolve the current browser session and validate that it owns the project; nested routes then validate the owning project record. Composite foreign keys prevent a task, attempt, message, test item or revision from referencing another project’s data. Resource edits and artifact edits support optimistic revision checks. Test submissions, attempts, imports and plan application use transactions and idempotency protections.

PostgreSQL DATE values remain date-only strings. Tasks keep local date/time and IANA timezone separately; weekly recurrence preserves the intended wall-clock time over daylight-saving changes. Timed tests use absolute server timestamps. The planner respects the selected daily window, avoids existing tasks and reports unscheduled minutes. It does not infer unlimited study capacity.

`STORAGE_PATH` defaults to `~/.local/share/ingenium/uploads`; the supplied local `.env` may use `.data/uploads`, outside the public application directory. Uploaded filenames never become filesystem paths. UUID storage keys, MIME allowlisting, file signatures, upload limits and controlled project-scoped file endpoints protect ingestion. Original bytes and historical versions are retained; resource deletion is a tombstone, so existing citations can still be interpreted. Deleting a whole project removes database records. It does not automatically garbage-collect orphaned file bytes.

The hosted configuration uses Neon PostgreSQL and private Vercel Blob storage (`STORAGE_PROVIDER=vercel-blob`). The cloud database has been migrated. Hosted API checks verified upload, extraction, exact-byte retrieval, persistent history and guest ownership; a separate hosted browser journey verified files, history and profile persistence. Deployment evidence is in [the universal launch record](docs/universal-launch.md).

`MAX_UPLOAD_MB=3` is the hosted configuration. The local example defaults to 15 MB. Vercel deployments reject local-disk upload storage; use private Blob or the S3-compatible adapter. Existing source versions retain their original storage-provider locator. [Storage setup](docs/object-storage.md) explains the providers and migration boundaries. The S3 adapter is implemented but still lacks a real-bucket smoke test.

## Environment and cloud deployment

All integration credentials stay on the server. Use `.env.example` for local configuration and the linked Vercel project's environment settings for hosted values.

| Variable                                                                                                   | Purpose                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                                                                             | PostgreSQL connection string. Local isolated database for development/tests; Neon connection for the hosted app.   |
| `DEMO_MODE`                                                                                                | Default `false`: separate browser guest workspaces. `true` enables the shared sample identity only outside Vercel. |
| `STORAGE_PROVIDER`                                                                                         | `local`, `vercel-blob` or `s3`. Hosted configuration uses `vercel-blob`.                                           |
| `BLOB_READ_WRITE_TOKEN`                                                                                    | Server credential for the connected private Vercel Blob store.                                                     |
| `STORAGE_PATH`                                                                                             | Persistent local upload directory; used only for local file locators.                                              |
| `MAX_UPLOAD_MB`                                                                                            | Application upload/read limit: hosted `3`, local example `15`.                                                     |
| `OPENAI_API_KEY`                                                                                           | Optional open-ended tutoring. Missing at the current verification checkpoint.                                      |
| `OPENAI_MODEL`                                                                                             | Provider model; the example uses `gpt-4.1-mini`.                                                                   |
| `AI_MAX_OUTPUT_TOKENS`                                                                                     | AI response limit; example value `2200`.                                                                           |
| `YOUTUBE_API_KEY`                                                                                          | Optional YouTube Data API v3 search and playlist import. Not yet configured at the current checkpoint.             |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | Alternative S3-compatible provider settings; see storage documentation.                                            |

The workspace is already linked to an existing Vercel project through local CLI metadata. Use that link rather than creating a replacement project. From this repository, the authenticated CLI workflow is:

```sh
vercel whoami
vercel env ls
vercel deploy
# After reviewing the preview and production environment:
vercel deploy --prod
```

Set `DEMO_MODE=false`, the Neon `DATABASE_URL`, `STORAGE_PROVIDER=vercel-blob`, the private store token and `MAX_UPLOAD_MB=3` in the appropriate preview/production environments. Apply `npm run db:migrate` with the intended cloud database connection supplied securely to that process before serving new code. Do not run the sample seed/reset against the cloud database. Changing server-side keys requires a deployment that receives the updated environment. The verified production alias is `ingenium-seven-jet.vercel.app`; no existing custom domains were changed.

## Local sample seed data

These records belong to the local shared sample fixture, not to newly created guest workspaces.

- Four independent projects: JEE, NEET, GMAT and university engineering.
- 60 original question definitions: 12 Physics, 12 Chemistry, 12 Maths, 12 Biology, 6 GMAT-style and 6 university examples. Physics and Chemistry are explicitly copied into both JEE and NEET, yielding 84 project-owned rows.
- Original notes, book/module references, two saved projectile experiments, question/lesson collections, flashcards, sample reviews and synthetic attempts.
- Today’s tasks, fixed commitments, sample focus sessions, in-app notifications and one resumable custom test anchored to its original server deadline.
- Three verified external YouTube lessons in JEE, with a separate project-owned motion lesson in NEET. IDs/titles/channels were checked through YouTube oEmbed. Unknown durations are not invented; the player supplies duration when available.

Seed content is synthetic. Book references do not include protected textbook pages. The question bank is illustrative topic coverage, not a complete official curriculum. Test marking is custom practice (+4 correct, −1 incorrect, 0 blank), not a claim of an official exam format. No official exam dates are invented.

## Scientific and learning rules

Twelve deterministic models live in `src/domain/science.ts`: projectile/free fall, incline friction, ideal spring, two-resistor DC circuit, converging thin lens, the specific hydrogen/oxygen reaction, dilution, first-order kinetics, quadratics, circle–line intersection, monohybrid inheritance and conceptual mitosis. Inputs are validated and computed again on the server when saving an artifact. These are ideal educational models with visible assumptions.

Numerical grading parses finite numbers and a bounded unit vocabulary without `eval`. Question-specific absolute tolerance and optional relative tolerance are respected. Multiple-choice uses exact-set matching under the stored custom policy. Free responses require review and do not receive invented deterministic correctness. Timed-test results show the automatically graded subtotal separately from responses awaiting self-review; unreviewed writing does not reduce that subtotal.

Accuracy means correct unaided responses divided by unaided correct/incorrect responses. Blank, malformed, hinted and revealed answers are excluded. Viewing a lesson or completing a task is not counted as mastery. Progress currently returns the most recent 500 attempt records; it does not claim national rank or predicted exam score.

Flashcard scheduling uses `ingenium-spaced-v1`: Again = 1 day, Hard = roughly 1.2× the prior interval (minimum 1), Good = roughly 2× (minimum 3), Easy = roughly 3× (minimum 7). Reviews are recorded explicitly; opening or flipping a card is not a successful recall event.

## AI and external services

The optional server-side OpenAI adapter uses `OPENAI_API_KEY` and `OPENAI_MODEL`. Without a key, the app saves messages and explains that open-ended tutoring is unavailable. The deterministic tools, source reader, notes, practice, tests, planning and progress remain usable. Example history is labelled as sample content. No fake token streaming is used. Failed, cancelled and interrupted responses can be retried up to three times using the original message, source versions and already-completed artifact; partial output is retained in generation history. Configured Responses API calls can use three allowlisted tools: compute and save a supported simulation, retrieve current-project source passages, and read actual progress. Arguments are strictly validated; the model cannot select another project. Simulation tool writes and their message links are atomic and idempotent within a generation.

Set a valid server-side key in your local environment to enable the provider. Do not paste it into browser code, commit it or add it to exported artifacts. The no-key mode is verified independently from a live provider; a configured live response has not been verified unless explicitly reported in the delivery notes.

YouTube uses supported embeds. Availability, embedding restrictions and network access are outside the application’s control. Notes remain accessible if playback is unavailable. Direct URL import resolves video titles/channels through YouTube oEmbed without an API key. Supported embeds provide playback; project-scoped viewing sessions, acknowledged resume positions, notes and collections persist in PostgreSQL. Optional `YOUTUBE_API_KEY` enables the implemented Data API search and paginated playlist preview/import. Without that key the UI reports those features unavailable while direct links remain usable. There is no transcript ingestion, and the tutor does not claim to have read unavailable captions. Provider fixtures test search/playlist behavior; they do not establish live-key access or unrestricted playback. [YouTube integration details](docs/youtube.md) documents restrictions, history semantics and endpoints. Updates show contextual official-source guidance and report that no live notice feed is connected.

## Verification

Run unit/integration checks against an isolated local `ingenium_demo` database with the seed present. The historical service fixtures need local sample mode; identity tests explicitly switch to private guests and test separation.

```sh
npm run typecheck
npm run lint
DEMO_MODE=true npm test
DEMO_MODE=true npm run test:integration
```

For the sample browser suite, start the app with `DEMO_MODE=true` on `http://localhost:3000`, then run `npm run test:e2e`. Playwright uses installed Google Chrome (`channel: chrome`); no browser binary is bundled. The private guest test intentionally skips in this suite. Run it separately against a guest-mode process, for example:

```sh
# Separate terminal, same isolated local test database:
DEMO_MODE=false npm run dev -- --port 3001
# Test terminal:
GUEST_WORKSPACE_TEST=true PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/guest-workspace.spec.ts --output test-results/guest --reporter=list
```

The guest test creates two browser contexts and checks project/file/history isolation, profile persistence and universal course setup. Existing service and browser fixtures cover persisted revisions, stale saves, scoped source access, answer privacy, timed-test resume/expiry/submission, grading, review, plan application/undo, recurrence and uploads. YouTube provider tests use injected responses; no real Data API key is implied by a passing test.

[Historical verification](docs/verification.md) preserves the earlier local sample milestone. [Universal launch evidence](docs/universal-launch.md) records the later guest/universal/storage work and deployment. The production build, typecheck and lint pass; Vitest passes **87 tests in 10 files**. The sample-mode browser run passes **25 journeys**, with the private guest case intentionally skipped there; that case passes separately, for **26 local browser scenarios**. The hosted deployment passed **29 API checks** and a separate run of the guest browser journey. Four hosted desktop/mobile screenshots had no overflow or page errors; the corrected dark Progress button has 6.28:1 contrast.

## Reset the synthetic demo

Reset is destructive and restricted to `DEMO_MODE=true` and the database named exactly `ingenium_demo`:

```sh
npm run demo:reset -- --confirm=ingenium-demo
npm run db:seed
```

The reset deliberately re-anchors sample dates. It is never run automatically at startup.

## Scope and remaining limits

This release is a no-sign-in guest demo with server-enforced browser-workspace ownership. It does not implement registered accounts, session recovery, cross-device account linking, payments or a production account-management system. The local shared sample fixture is opt-in and is disabled on Vercel.

The implementation provides a connected deterministic learning loop. It does not provide complete official syllabuses, official-format/adaptive exam scoring, OCR, full video transcript retrieval, external calendar synchronization, outbound notifications, or payment collection. Question imports support JSON and CSV parsing, validated preview and exact-duplicate skipping. Source chunks retain source version, section, PDF page number where extraction supplies it, and text offsets within the page. PDF visual text highlighting by rectangle is not implemented. Planning uses a bounded daily window, priorities/due dates when supplied, existing commitments and explicit curriculum prerequisites. Matched dependent topics wait for included prerequisite workloads, or remain unscheduled if an uncovered prerequisite is omitted. This is a deterministic capacity scheduler, not an optimizer across multiple availability windows. Template versions can be reviewed and mapped while preserving historical attempts; official syllabus equivalence still requires curriculum-specific verification.

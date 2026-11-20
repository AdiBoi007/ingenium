# YouTube lessons and viewing history

Cramazon accepts public YouTube videos about any subject. It does not filter by exam, course, channel, or the project's subject list. YouTube remains the video host and controls playback, advertisements, age/region restrictions, removals, and embedding availability.

## What works without a key

Paste a watch, `youtu.be`, Shorts, live, or embed URL. The server validates the exact YouTube hostname and video ID, then requests title/channel metadata from YouTube's fixed HTTPS oEmbed endpoint. It never fetches an arbitrary user-supplied origin and never renders provider-supplied HTML. The supported iframe player provides playback and duration.

An oEmbed result verifies the title and channel; it is not a promise that playback will work for every viewer. If metadata cannot be obtained, a learner can enter a title and save an explicitly unverified link. Their notes and collection membership remain available when a video becomes unavailable. A manually changed display title is distinct from the original provider title retained in metadata.

## Optional Data API connection

Set `YOUTUBE_API_KEY` only in the server environment to enable search and playlist previews/imports. Enable the YouTube Data API v3 for that key and configure suitable API restrictions and provider quotas. The browser never receives the key. No key was provisioned or used in the repository's tests.

Search uses the official [`search.list`](https://developers.google.com/youtube/v3/docs/search/list) API with video-only, embeddable results, followed by [`videos.list`](https://developers.google.com/youtube/v3/docs/videos/list) to check public/unlisted status, embedding permission, and duration. Playlist previews use [`playlistItems.list`](https://developers.google.com/youtube/v3/docs/playlistItems/list), at most 50 items per page, followed by the same video checks. Private, removed, unavailable, and non-embeddable entries are reported as unavailable. Only selected verified videos on the visible page are imported; subsequent pages require another explicit action. A partial collection is marked as partial.

Without a key, search and playlist endpoints return `available:false` with an explanation. Provider quota, network, and permission failures return an explicit error. There is no scraping, fabricated result list, video download, or transcript ingestion. Player-generated captions are controlled by YouTube; the tutor cannot claim to have read them.

Successful oEmbed metadata is cached in PostgreSQL for 24 hours, and Data API result pages for 15 minutes. Pagination uses opaque server-stored cursors bound to the student-owned project, query or playlist, and endpoint, expiring after 30 minutes. Raw provider page tokens are not accepted. Expired cache/cursor rows are removed when that project's cache is next written. Provider-dependent routes have a persisted budget of 30 requests per minute per workspace, in addition to general mutation limits. This is an application guard, not a replacement for provider quotas.

## Durable viewing state

Each playback save includes a unique event ID, player session ID, resume position, actual measured viewing delta (0–60 seconds), state, and optional client occurrence time/sequence. PostgreSQL stores the event, accumulates measured time in its session and lesson, and retains the latest resume position. Repeated event IDs do not count twice. Out-of-order events contribute their unique viewing delta but cannot replace a newer position or session state. Seeking does not count as viewing; reaching the end does not automatically mark a lesson complete.

The player periodically saves, saves on state changes, and uses keepalive/beacon on exit. Failed periodic saves can be retried with the same event ID. A browser or network termination can still prevent the final unsent interval from reaching the server; the most recently acknowledged position remains durable. History survives reloads and service restarts. It is scoped to the current workspace and project, including when the same YouTube video appears in multiple projects.

Clearing history removes viewing sessions/events, measured seconds, and resume positions for the selected lesson or project. It preserves saved videos, manual completion, collections, and notes. Deleting the owning project removes its video data with the rest of its project-owned records.

## Endpoints

All paths below are relative to `/api/projects/:projectId`. The current workspace must own the project.

| Endpoint                               | Behavior                                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GET /youtube/capabilities`            | Reports key-dependent search/playlist availability.                                                                  |
| `POST /youtube/resolve`                | `{url}` → metadata item with verified/unavailable state.                                                             |
| `GET /youtube/search?q=...&cursor=...` | An available/unavailable result page and optional next cursor.                                                       |
| `POST /youtube/playlist/preview`       | `{url,cursor?}` → current page, unavailable items and total count.                                                   |
| `POST /youtube/playlist/import`        | `{url,cursor?,videoIds?,subject?,topic?}` → scoped lessons and collection; preserves existing lesson progress/notes. |
| `POST /lessons/import`                 | `{url,title?,subject?,topic?,saved?}` → lesson, deduplicated by video within the project.                            |
| `POST /lessons/:id/playback`           | Idempotent playback event; returns the persisted lesson.                                                             |
| `GET /lessons/history`                 | Latest 200 watched lessons ordered by last viewing time, with cumulative seconds/session count.                      |
| `GET /lessons/:id/history`             | Latest 200 persisted sessions for one lesson.                                                                        |
| `DELETE /lessons/history`              | Clears project viewing state only.                                                                                   |
| `DELETE /lessons/:id/history`          | Clears one lesson's viewing state only.                                                                              |

Legacy lesson `PATCH` requests containing position/watchedSeconds remain supported and write through the same history service; their session is grouped under a legacy identifier. New playback clients should use explicit sessions, unique event IDs, occurrence timestamps, and monotonic per-session sequences.

## Verification

`tests/backend.youtube.test.ts` uses injected deterministic oEmbed/Data API responses and an isolated PostgreSQL fixture. It verifies URL trust boundaries, universal-topic import, truthful missing-key states, cache/cursor scoping, embeddability filtering, selected playlist imports, deduplication, idempotent viewing time, out-of-order writes, project isolation, and clearing history without losing notes/completion. Provider fixtures are not a claim that a real Data API key or every external video has been tested. Live YouTube playback remains subject to YouTube and the viewer's network/browser settings.

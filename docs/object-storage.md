# File storage

The application supports persistent local files, private Vercel Blob objects and private S3-compatible objects. PostgreSQL stores each source version and its provider locator. File endpoints first verify that the current browser workspace owns the project, then read the stored bytes on the server. Provider credentials stay in the server environment.

## Hosted configuration: private Vercel Blob

The current cloud setup uses migrated Neon PostgreSQL and a connected private Vercel Blob store:

```dotenv
DEMO_MODE=false
STORAGE_PROVIDER=vercel-blob
MAX_UPLOAD_MB=3
```

Supply `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` through the linked Vercel project's server environment. The Blob store must be private. No credential value belongs in this document, a public environment variable, browser code or source control.

The adapter uses `@vercel/blob` with `access: "private"`, a server-generated `ingenium/<key>` pathname, no random suffix and overwrites disabled. It stores a `blob:` locator in PostgreSQL. Reads use the private SDK on the server and return bytes through the workspace/project-scoped application file endpoint. The SDK also supports deletion for explicit cleanup; the application's whole-project deletion does not currently garbage-collect orphaned objects.

A real private Blob write/read byte roundtrip passed, followed by hosted API upload/extraction/exact-byte retrieval and cross-guest access checks. The promoted public deployment also passed the guest browser journey, including file retrieval, history and profile persistence. See [the universal launch record](universal-launch.md) for the separate local, provider and hosted evidence.

The hosted application limit is 3 MB per uploaded file. This is the configured application limit, not a claim about the Blob service's maximum object size. Blob/S3 reads also use `MAX_UPLOAD_MB`; lowering the limit can make an older, larger stored version unavailable through the application. Keep the intended read policy in mind when migrating existing uploads.

Vercel deployments reject the local-disk upload provider. Ephemeral serverless filesystems are not persistent upload storage. Connect Blob or use the alternative S3 provider before enabling hosted uploads.

## Persistent local storage

`STORAGE_PROVIDER=local` is the local example configuration. `STORAGE_PATH` selects the persistent directory; when omitted, it defaults to `~/.local/share/ingenium/uploads` for the OS user running the application. Keep it outside the public web directory and back up the database and directory together. The local example upload limit is `MAX_UPLOAD_MB=15`.

The local adapter creates files with exclusive writes and restrictive permissions. Filenames supplied by learners never become filesystem paths. Only validated, flat server-generated storage keys are accepted. Local byte roundtrips and invalid-key rejection are tested.

## Alternative S3-compatible storage

The included adapter uses the official AWS JavaScript SDK. Configure `STORAGE_PROVIDER=s3`, `S3_BUCKET`, `S3_REGION`, an optional `S3_ENDPOINT`, and server credentials. `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` are supported, as is standard AWS credential discovery. Set `S3_FORCE_PATH_STYLE=true` only when the selected service requires it. The application does not create or publish buckets.

Use a private bucket and a narrowly scoped policy permitting object put/get/delete under `ingenium/`. Custom endpoints require HTTPS except for localhost development. Conditional writes prevent overwriting a historical source object. PostgreSQL retains an `s3:` locator and the server mediates reads after project ownership checks.

The S3 implementation has not been verified against a real bucket in this delivery. Run a real-provider byte smoke test and the deployed upload/read flow before selecting it as the hosted provider. The verified cloud provider for the current setup is private Vercel Blob.

## Versions, migration and extraction

Switching `STORAGE_PROVIDER` changes new uploads only. Existing `blob:`, `s3:` and local locators continue to use their original provider; they therefore still need the corresponding credential or persistent directory. Move bytes and rewrite locators only through an explicit, checked migration. Changing the environment variable alone does not migrate old uploads.

Upload bytes, source version and a queued ingestion job are persisted before text extraction. Text-bearing PDFs and supported text documents can be read and indexed; OCR is not configured for images or scanned PDFs. Interrupted jobs can be recovered by `scripts/db-worker.ts`. Stored bytes, successful extraction and usable citations are separate outcomes, and the interface reports extraction errors rather than inventing content.

Replacing a file retains previous source versions. Resource deletion is a tombstone so historical references remain interpretable. Whole-project deletion cascades through database records; orphaned file/object cleanup requires a separate retention/garbage-collection process that is not yet implemented.

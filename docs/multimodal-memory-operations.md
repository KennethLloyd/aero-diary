# Manual memory migration and backfill

Journal entries and private Drive photos remain the source of truth. Text and photo
vectors are replaceable derived data. EmbeddingGemma 2 (`embeddinggemma-2:440m`)
is the intended single model for passages, photos, and queries; old-model vectors
must be regenerated from source, never converted or searched using a new-model
query vector.

**Preserve the completed production backfill.** The owner reports that 3,500+
photos have already been indexed. Issue [#104](https://github.com/KennethLloyd/aero-diary/issues/104)
does not authorize another backfill, reindex, deployment, or activation of indexing,
retrieval, or vision. Schema migration, application startup, worker startup, and
enabling a flag never scan or enqueue historical photos. Any further production
operation requires separate approval.

## Retrieval and conversation

One `embeddinggemma-2:440m` query vector searches both passage and photo vectors.
Each entry ranks by its best cosine match; source scores are not added or weighted.
Evidence retains the best passage and up to three photos per entry, so many photos
cannot dominate the entry list. Existing relevance, recent, and longitudinal
selection still applies to the grouped entries.

When retrieval and vision are enabled, Aero rechecks current-user ownership,
privately downloads and normalizes at most three matched photos, and sends JPEG
data URLs through the existing ChatMock chat endpoint. Luna receives actual image
bytes, not private Drive links or vectors. Failed/missing photos leave text evidence
available, and Luna is instructed not to invent visual details. Follow-ups reuse
safe photo/entry references from the latest retrieval, preserving its ranking, and
recheck ownership/source state before sending freshly downloaded images. Image
payloads never enter chat evidence storage or summaries.

Photo forwarding failures emit a server warning with `PHOTO_FORWARDING_FAILED`,
photo/entry IDs, the failed step, and the exception's diagnostic fields. Download
and decode errors retain their original exception as `cause`. Application-defined
messages are logged; provider/database causes expose their type, code, and HTTP
status when available. Raw SDK messages, request/response objects, private URLs,
credentials, and image bytes are excluded. Request cancellation is propagated
without a warning, and text-only fallback behavior is unchanged.

## Read-only inspection

Both commands require an explicit owner. They default to a dry run and inspect at
most 100 rows; `--limit` accepts 1–1000. No queue is started or created during a dry
run. `--status` explicitly selects this same read-only verification mode and cannot
be combined with `--enqueue`.

```sh
pnpm memory:backfill --user-id OWNER_ID --status --limit 100
pnpm memory:photos:backfill --user-id OWNER_ID --status --limit 100
```

The JSON result reports `examined`, `current`, `old`, `missing`, `failed`, `skipped`,
`queued`, and `nextCursor`. These are **page counts**, not corpus-wide totals. `old`
includes changed source or outdated model/preprocessing provenance. Current rows
are not enqueued again. Text failures reflect retained failed pg-boss jobs for
noncurrent entries in this page; expired queue history cannot prove success or
failure. Photo failures, inference pauses (counted as failed), and skips are persisted on the photo-memory row. Inspect
its `errorCode` and `errorMessage` before explicitly retrying the affected photo.

Use the returned `nextCursor` as `--after ID` with the same owner and filters. A
null cursor means this filtered scan reached its end. IDs are ordered ascending;
a deleted cursor still works because pagination uses `id > cursor`. Start a fresh
scan after source restoration or concurrent changes to include newly eligible rows.
To verify completion, repeat from the first page after workers finish and aggregate
all pages. Inspect and resolve every noncurrent count; a zero queued count alone is
not completion proof.

## Approved future canaries and batches

These examples describe a future operation; they were not run for production.
`--enqueue` is the only option that writes queue jobs. It queues only noncurrent
rows from one bounded page and performs no image download or model inference itself.
`PHOTO_INDEXING_ENABLED=true` is required before enqueueing photos. It also explicitly retries failed/skipped rows; select their IDs after addressing
the reported cause rather than repeatedly retrying a whole failed batch.

```sh
# Inspect selected source records first.
pnpm memory:backfill --user-id OWNER_ID --entry-id ENTRY_ID --limit 1
pnpm memory:photos:backfill --user-id OWNER_ID --photo-id PHOTO_ID --limit 1

# Only during a separately approved operation, enqueue that same canary.
pnpm memory:backfill --user-id OWNER_ID --entry-id ENTRY_ID --limit 1 --enqueue
pnpm memory:photos:backfill --user-id OWNER_ID --photo-id PHOTO_ID --limit 1 --enqueue

# Inspect a bounded date range, then resume the next page using its returned ID.
pnpm memory:photos:backfill --user-id OWNER_ID --from 2026-09-01 --to 2026-09-30 --limit 20
pnpm memory:photos:backfill --user-id OWNER_ID --from 2026-09-01 --to 2026-09-30 --limit 20 --after LAST_PHOTO_ID
```

`--entry-id` is repeatable on both commands. `--photo-id` is repeatable on the photo
command. ID selectors are intersected with owner, inclusive canonical journal-date
filters (`--from` / `--to`), and cursor; they cannot bypass ownership. Configured
demo data is excluded. A wrong owner/ID combination returns no rows.

Each queued text job re-reads the source and compares model/version/fingerprint;
current work is idempotent, changed work is checked again before atomic replacement.
Photo jobs independently download, normalize, embed, and revalidate source identity
before persistence. Deleted photos cannot be recreated by old jobs. Do not enqueue
unbounded work: process one canary, verify retrieval, and then approve bounded pages.

## Photo worker requirements and controls

The separate photo worker needs the existing private Drive credentials/root settings,
`DATABASE_URL`, and access to the same local Ollama endpoint/model as text indexing.
Do not place credentials or public Drive URLs in vector records. No production
secret or deployment setting is changed by this PR.

`pnpm memory:queue:setup` prepares both queues without creating jobs. Use exactly
one `pnpm memory:photo:worker` process; its singleton queue policy also limits active
photo jobs globally to one. Image jobs have zero automatic retries. Text jobs retain
their existing bounded retries and atomic per-entry generation replacement. The
text worker now requires `JOURNAL_TEXT_INDEXING_ENABLED=true` to start; leave it
false until the approved text canary/rebuild. Saving entries may queue text work
while the worker is stopped. With photo indexing enabled, only newly attached
photos are queued transactionally on create/edit; existing attachments are never
scanned or scheduled by an ordinary edit.

Keep `PHOTO_INDEXING_ENABLED=false`, `PHOTO_MEMORY_ENABLED=false`, and
`PHOTO_VISION_ENABLED=false` until their respective later validation steps are
approved. These controls separate background inference, vector retrieval, and image
forwarding to Luna. Enabling them does not enqueue historical work. For bulk work,
stop the photo worker between bounded pages; durable jobs remain queued for resume.
Stopping it does not guarantee an in-flight Ollama computation stops. Do not restart
Ollama automatically after a timeout or immediately retry stalled inference.

An image inference failure records `PAUSED` and stops the photo worker. Inspect the
failure and resource usage first. During an approved operation, acknowledge it with
`pnpm memory:photo:worker --resume`, then start `pnpm memory:photo:worker` explicitly.
The acknowledgement clears the persisted pause; it does not start a worker or
requeue failed jobs. Select failed photo IDs with the backfill command to retry them
explicitly. Other queued photo work remains durable while the worker is stopped.

Photo inference receives normalized JPEG bytes only: EXIF orientation is applied,
aspect ratio is preserved, images never upscale, longest edge is at most 512px,
quality defaults to 85, metadata is stripped, and transparency is flattened onto
white. Originals in Drive stay unchanged. The default input limit is 10 MiB and
the decoded-pixel ceiling is 64,000,000, allowing ordinary 24 MP and 48 MP photos
within the byte limit. Oversized/corrupt/unsupported images produce an explicit
failure/skip status. Adjust a safety limit deliberately after inspecting a failure;
do not silently skip valid phone photos.

New uploads are checked by their encoded signatures, not just browser labels.
WebP is rejected, including files disguised as JPEG or PNG. JPEG and PNG keep
their bytes; HEIC/HEIF retain JPEG conversion. New Drive filenames, MIME types,
and staged byte counts describe the bytes actually stored.

Indexing and vision share the same normalizer. It also accepts single-frame
legacy WebP labeled `image/jpeg` or `image/webp`, but rejects animated WebP and
other format mismatches. Incomplete or invalid photos are skipped, not repaired.
JPEGs must contain a real end-of-image marker outside metadata and pass strict
`failOn: 'warning'` decoding. No ending bytes are synthesized: decoding after an
EOI append cannot prove the original image was complete, even for baseline JPEGs.
Originals and source records are never repaired or renamed.

The valid JPEG/PNG pipeline and `jpeg-exif-white-v1` version remain unchanged.
Completed indexes stay searchable, including any existing embeddings for damaged
photos, but an invalid original is not sent to vision. Other usable photos and text
evidence remain available. New indexing attempts record invalid inputs as skipped,
without calling the embedding model. There is no index purge or automatic reindex.

The temporary backfill workaround used derived JPEGs and EOI appends. Its exact
source/configuration is unavailable in the repository or recorded triage, so
parity for usable photos still needs checking before rollout. Skipping invalid
originals is the agreed policy, not a reason to invalidate completed indexes.
Any output difference requiring selective reindexing needs separate approval.

Local built-runtime verification for #104 used synthetic images, an isolated
PostgreSQL database, and an in-memory Drive sink. It exercised the authenticated
upload endpoint with storage unconfigured, plus built upload/normalization helpers:
disguised WebP was rejected before storage; JPEG/PNG retained consistent bytes,
MIME, extension, and size; valid JPEG/PNG normalized bytes matched the previous
pipeline; and legacy WebP became oriented, resized, metadata-free JPEG. Follow-up
built-runtime checks confirmed that JPEGs missing ending bytes or later scans are
rejected, while intact baseline/progressive JPEG and PNG output is unchanged.
The temporary HTTP harnesses were removed afterward. No private photos, real Drive
writes, model calls, production backfill, or production feature activation were
used for this verification.

Native Sharp/libvips decode is bounded by input bytes and decoded pixels; a
JavaScript abort signal cannot reliably interrupt native decoding. Processing runs
sequentially in the separate worker. HTTP cancellation also cannot guarantee Ollama
stops CPU work, which is why inference failures pause processing instead of retrying.

Photo paths are content-addressed in the existing upload flow. Database source
changes update `Photo.updatedAt`, invalidating retrieval immediately. If an operator
replaces bytes in Drive under an unchanged file identity/path, that controlled
operation must also increment `Photo.sourceVersion`; out-of-band Drive edits are
not polled. An explicit retry then fetches the new bytes and rebuilds the vector.
The normalized content hash and preprocessing version are retained as provenance;
changing resize/quality configuration requires rebuilding affected photo vectors.

## Configuration

See `.env.example` for all defaults. `MEMORY_EMBEDDING_MODEL` configures the single
shared model. `OLLAMA_EMBEDDING_MODEL` remains a temporary environment fallback for
existing installations; the new name takes precedence. After controlled cutover,
remove the legacy setting and old installed model when rollback is no longer needed.
This does not implement cross-model retrieval or vector conversion.

Photo controls are `PHOTO_INDEXING_ENABLED`, `PHOTO_MEMORY_ENABLED`, and
`PHOTO_VISION_ENABLED`; all default off. `PHOTO_VISION_MAX_IMAGES` defaults to 3
and cannot exceed 3. Limits use `PHOTO_MEMORY_MAX_INPUT_BYTES` (10 MiB),
`PHOTO_MEMORY_MAX_DECODED_PIXELS` (64,000,000), `PHOTO_MEMORY_LONGEST_EDGE` (512,
maximum 512), `PHOTO_MEMORY_JPEG_QUALITY` (85),
`PHOTO_MEMORY_DOWNLOAD_TIMEOUT_MS` (30,000),
`PHOTO_MEMORY_INFERENCE_TIMEOUT_MS` (30,000), and
`PHOTO_MEMORY_INFERENCE_THREADS` (1). Keep inference threads at one for rollout.
The text transport uses the existing `OLLAMA_BASE_URL`, batch/keep-alive settings,
and `OLLAMA_EMBEDDING_TIMEOUT_MS` (new default 30,000).

The later deployment must provide Drive OAuth settings to the photo worker,
install the additive migration/queue definitions and the existing Sharp native
runtime, and explicitly configure the model and disabled controls before starting
workers. No production secrets, model files, services, or networking are changed here.

## Later replacement sequence

After photo restoration and independent operational approval: deploy with photo
controls off, run a text canary, verify text retrieval, rebuild text in bounded
pages, and verify every page against the new model/version. Then canary photos,
verify visual retrieval and Luna's actual image reasoning, and gradually index
approved photo pages. Enable retrieval/vision only after that evidence is accepted.

The old EmbeddingGemma model setting and old generation rows become obsolete after
successful text replacement. Text replacement deletes/replaces each entry's old
derived generation atomically; keep operational rollback options until validation
is complete. This PR does not remove the installed production model or old vectors,
change deployment configuration, or perform production vector generation.

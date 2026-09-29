# Aero AI API

Aero AI's conversation API is available on the private Tailscale network. It
uses the same saved threads and journal-backed replies as the browser.

## Token access

Sign in to the private account, unlock the browser if App Lock is enabled, then
open **Settings → Aero AI API** and generate a token. Copy the secret when it is
shown: Aero Diary stores only its hash and cannot show it again. Generating a
replacement invalidates the old token; **Revoke token** disables API access.

A token can read and continue every Aero AI conversation owned by that account,
including answers that retrieve private journal entries. It works while the
browser is locked, so keep it in a local secret store. Do not put it in source
control, URLs, support requests, or command logs. The configured demo account
cannot use Aero AI.

## HTTP examples

Set the base URL to the HTTPS hostname served inside your tailnet. Provide the
token through your client's local secret store as `AERO_AI_TOKEN`:

```bash
export AERO_DIARY_BASE_URL="https://aero-diary.<your-tailnet>.ts.net"
: "${AERO_AI_TOKEN:?Load AERO_AI_TOKEN from your local secret store first}"
```

Create a saved thread:

```bash
curl --fail-with-body --silent --show-error \
  -X POST "$AERO_DIARY_BASE_URL/api/aero-ai/threads" \
  -H "Authorization: Bearer $AERO_AI_TOKEN"
```

Use the returned `id` as `THREAD_ID`. Send a completed JSON reply with a new
UUID request ID:

```bash
THREAD_ID="<thread-id-from-create-response>"
REQUEST_ID="<new-uuid>"
curl --fail-with-body --silent --show-error \
  -X POST "$AERO_DIARY_BASE_URL/api/aero-ai/threads/$THREAD_ID/messages" \
  -H "Authorization: Bearer $AERO_AI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"content\":\"What did I write about this week?\",\"requestId\":\"$REQUEST_ID\",\"stream\":false}"
```

For a streamed reply, use `stream: true` (the default) and disable curl's
output buffering. Events are `start`, `delta`, `done`, or `error`:

```bash
REQUEST_ID="<new-uuid>"
curl --no-buffer --fail-with-body --silent --show-error \
  -X POST "$AERO_DIARY_BASE_URL/api/aero-ai/threads/$THREAD_ID/messages" \
  -H "Authorization: Bearer $AERO_AI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"content\":\"Can you remind me who I went with?\",\"requestId\":\"$REQUEST_ID\",\"stream\":true}"
```

Reuse the same `requestId` when retrying a request whose result was not
received. Use a new UUID for each follow-up message. The thread's full history
is available from these same endpoints:

```bash
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $AERO_AI_TOKEN" \
  "$AERO_DIARY_BASE_URL/api/aero-ai/threads"

curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $AERO_AI_TOKEN" \
  "$AERO_DIARY_BASE_URL/api/aero-ai/threads/$THREAD_ID"
```

While signed into the same private account in the browser, open
`$AERO_DIARY_BASE_URL/aero-ai?thread=$THREAD_ID` to continue the conversation
there. Browser requests still require an unlocked session; bearer requests
continue to work when the browser is locked. The API does not expose a separate
journal retrieval endpoint: Aero AI handles retrieval inside the shared chat
flow.

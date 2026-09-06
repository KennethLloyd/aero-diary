#!/bin/sh

set -eu

runtime_image=${CONTAINER_RUNTIME_IMAGE:-aero-diary:test-runtime}
migration_image=${CONTAINER_MIGRATION_IMAGE:-aero-diary:test-migrate}
demo_email=${PLAYWRIGHT_DEMO_EMAIL:-container-smoke@example.com}
demo_password=${PLAYWRIGHT_DEMO_PASSWORD:-container-smoke-password}

command -v docker >/dev/null 2>&1 || {
  echo 'container acceptance requires Docker.' >&2
  exit 1
}
command -v pnpm >/dev/null 2>&1 || {
  echo 'container acceptance requires pnpm.' >&2
  exit 1
}

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/aero-diary-container.XXXXXX")
container_id=''
data_dir=''

cleanup_data_dir() {
  data_path=$1

  [ -n "$data_path" ] || return 0
  [ -d "$data_path" ] || return 0

  # The acceptance flow deliberately gives this temporary bind mount to the
  # simulated container identity. Let a short-lived root container remove the
  # identity-owned SQLite files before the host-side cleanup removes the
  # temporary directory. This keeps the ownership test intact without making
  # the test data world-writable or changing the production image contract.
  docker run --rm \
    --user 0:0 \
    --entrypoint /bin/sh \
    --volume "$data_path:/app/data" \
    "$runtime_image" \
    -c 'rm -rf -- /app/data/aero-diary.db /app/data/aero-diary.db-*'
}

cleanup() {
  status=$?
  if [ -n "$container_id" ]; then
    docker rm --force "$container_id" >/dev/null 2>&1 || true
  fi
  if [ -n "$data_dir" ]; then
    cleanup_data_dir "$data_dir" || status=1
  fi
  rm -rf "$work_dir" || status=1
  exit "$status"
}
trap cleanup EXIT INT TERM

for identity in 1000 1001; do
  data_dir="$work_dir/data-$identity"
  mkdir -p "$data_dir"

  # Simulate a host-controlled bind mount owned by the configured identity.
  docker run --rm --entrypoint /bin/sh \
    --volume "$data_dir:/app/data" \
    "$runtime_image" \
    -c "chown -R $identity:$identity /app/data"

  docker run --rm \
    --env DATABASE_URL=file:/app/data/aero-diary.db \
    --env AERO_DIARY_UID="$identity" \
    --env AERO_DIARY_GID="$identity" \
    --volume "$data_dir:/app/data" \
    "$migration_image" >/dev/null

  # Seed one ordinary authenticated user without adding provisioning tools to
  # the production image. This process intentionally runs as the configured
  # identity, just like the app and migration commands.
  docker run --rm \
    --user "$identity:$identity" \
    --env SMOKE_EMAIL="$demo_email" \
    --env SMOKE_PASSWORD="$demo_password" \
    --volume "$data_dir:/app/data" \
    --entrypoint node \
    "$migration_image" \
    -e 'const Database = require("better-sqlite3"); const { hash } = require("@node-rs/argon2"); (async () => { const db = new Database("/app/data/aero-diary.db"); const passwordHash = await hash(process.env.SMOKE_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 }); db.prepare("INSERT INTO User (id, email, passwordHash, name) VALUES (?, ?, ?, ?)").run("container-smoke-user", process.env.SMOKE_EMAIL, passwordHash, "Container Smoke"); db.close(); })().catch((error) => { console.error(error); process.exit(1); });'

  container_id=$(docker run --detach \
    --publish 127.0.0.1::3000 \
    --env DATABASE_URL=file:/app/data/aero-diary.db \
    --env AERO_DIARY_UID="$identity" \
    --env AERO_DIARY_GID="$identity" \
    --env LLM_BASE_URL=http://127.0.0.1:9/v1 \
    --env LLM_MODEL=gpt-5.6-luna \
    --env LLM_REASONING_EFFORT=medium \
    --env LLM_MAX_TOKENS=1 \
    --env LLM_TIMEOUT_MS=1000 \
    --volume "$data_dir:/app/data" \
    "$runtime_image")

  port=$(docker port "$container_id" 3000/tcp | sed 's/.*://')
  ready=no
  attempt=0
  while [ "$attempt" -lt 60 ]; do
    if curl --fail --silent "http://127.0.0.1:$port/api/health" >/dev/null; then
      ready=yes
      break
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  [ "$ready" = yes ] || {
    docker logs "$container_id" >&2
    exit 1
  }

  process_table=$(docker top "$container_id" -eo user,group,pid,args)
  echo "$process_table" | awk -v identity="$identity" '$1 == identity && $2 == identity { found = 1 } END { exit found ? 0 : 1 }'
  groups=$(docker exec "$container_id" /bin/sh -c "awk '/^Groups:/{print \$0}' /proc/1/status")
  group_count=$(echo "$groups" | awk '{ print NF - 1 }')
  [ "$group_count" -eq 0 ] || {
    echo "unexpected process groups for $identity: $groups" >&2
    exit 1
  }

  PLAYWRIGHT_BASE_URL="http://127.0.0.1:$port" \
    PLAYWRIGHT_DEMO_EMAIL="$demo_email" \
    PLAYWRIGHT_DEMO_PASSWORD="$demo_password" \
    PLAYWRIGHT_POLISH_DISABLED=1 \
    pnpm exec playwright test tests/e2e/container-cache.spec.ts

  if docker logs "$container_id" 2>&1 | rg -i 'EACCES|permission denied|prerender'; then
    exit 1
  fi

  docker rm --force "$container_id" >/dev/null
  container_id=''
  cleanup_data_dir "$data_dir"
  data_dir=''
done

echo 'Container acceptance passed for 1000:1000 and 1001:1001.'

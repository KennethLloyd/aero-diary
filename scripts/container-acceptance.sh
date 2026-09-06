#!/bin/sh

set -eu

runtime_image=${CONTAINER_RUNTIME_IMAGE:-aero-diary:test-runtime}
migration_image=${CONTAINER_MIGRATION_IMAGE:-aero-diary:test-migrate}
demo_email=${PLAYWRIGHT_DEMO_EMAIL:-container-smoke@example.com}
demo_password=${PLAYWRIGHT_DEMO_PASSWORD:-container-smoke-password}
storage_helper_image=${CONTAINER_STORAGE_HELPER_IMAGE:-busybox:1.36}
smoke_password_hash=$(SMOKE_PASSWORD="$demo_password" node -e 'const { hash } = require("@node-rs/argon2"); hash(process.env.SMOKE_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 }).then(console.log).catch((error) => { console.error(error); process.exit(1); })')

sql_escape() {
  printf '%s' "$1" | sed "s/'/''/g"
}

smoke_email_sql=$(sql_escape "$demo_email")
smoke_password_hash_sql=$(sql_escape "$smoke_password_hash")
smoke_user_sql="INSERT INTO User (id, email, passwordHash, name) VALUES ('container-smoke-user', '$smoke_email_sql', '$smoke_password_hash_sql', 'Container Smoke');"

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

prepare_data_dir() {
  data_path=$1
  mkdir -p "$data_path"

  # This disposable root helper prepares test data only. Production images
  # always start and remain as node:node; they never repair /app/data.
  docker run --rm \
    --volume "$data_path:/app/data" \
    "$storage_helper_image" \
    sh -c 'chown 1000:1000 /app/data && chmod 700 /app/data'
}

cleanup_data_dir() {
  data_path=$1

  [ -n "$data_path" ] || return 0
  [ -d "$data_path" ] || return 0

  # Files are owned by node, so cleanup runs as the image's normal identity.
  docker run --rm --entrypoint /bin/sh \
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

verify_mount_identity() {
  data_path=$1
  expected_permissions=${2:-700}

  docker run --rm --entrypoint /bin/sh \
    --volume "$data_path:/app/data" \
    "$runtime_image" \
    -c "\
      actual=\$(stat -c '%u:%g' /app/data); \
      [ \"\$actual\" = '1000:1000' ] || { echo \"unexpected mounted identity: \$actual\" >&2; exit 1; }; \
      permissions=\$(stat -c '%a' /app/data); \
      [ \"\$permissions\" = '$expected_permissions' ] || { echo \"unexpected mounted permissions: \$permissions\" >&2; exit 1; }"
}

verify_storage_contract() {
  data_path=$1

  docker run --rm --entrypoint /bin/sh \
    --volume "$PWD:/workspace:ro" \
    --volume "$data_path:/app/data" \
    "$runtime_image" \
    -c '/workspace/scripts/verify-container-storage.sh /app/data'
}

data_dir="$work_dir/data"
prepare_data_dir "$data_dir"
verify_mount_identity "$data_dir"
verify_storage_contract "$data_dir"

docker run --rm \
  --env DATABASE_URL=file:/app/data/aero-diary.db \
  --volume "$data_dir:/app/data" \
  "$migration_image"

# Seed one ordinary authenticated user without adding provisioning tools to
# the production image. This process runs as node:node, like migrations/app.
printf '%s\n' "$smoke_user_sql" | docker run --rm -i \
  --env DATABASE_URL=file:/app/data/aero-diary.db \
  --volume "$data_dir:/app/data" \
  --entrypoint /app/node_modules/.bin/prisma \
  "$migration_image" \
  db execute --stdin

echo 'Starting runtime acceptance container.'
runtime_start_output=$(docker run --detach \
  --publish 127.0.0.1::3000 \
  --env DATABASE_URL=file:/app/data/aero-diary.db \
  --env LLM_BASE_URL=http://127.0.0.1:9/v1 \
  --env LLM_MODEL=gpt-5.6-luna \
  --env LLM_REASONING_EFFORT=medium \
  --env LLM_MAX_TOKENS=1 \
  --env LLM_TIMEOUT_MS=1000 \
  --volume "$data_dir:/app/data" \
  "$runtime_image" 2>&1) || {
  status=$?
  echo 'Could not start the runtime acceptance container.' >&2
  printf '%s\n' "$runtime_start_output" >&2
  exit "$status"
}
container_id=$(printf '%s\n' "$runtime_start_output" | tail -n 1)
echo "Runtime acceptance container started: $container_id."

port=$(docker port "$container_id" 3000/tcp 2>/dev/null | sed 's/.*://')
if [ -z "$port" ]; then
  echo 'Runtime acceptance container did not publish port 3000.' >&2
  docker logs "$container_id" >&2 || true
  exit 1
fi

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

process_identity=$(docker exec "$container_id" /bin/sh -c "awk '/^Uid:/{uid=\$3} /^Gid:/{gid=\$3} END{print sprintf(\"%s:%s\", uid, gid)}' /proc/1/status")
[ "$process_identity" = '1000:1000' ] || {
  echo "unexpected process identity: $process_identity" >&2
  docker logs "$container_id" >&2 || true
  exit 1
}
groups=$(docker exec "$container_id" /bin/sh -c "awk '/^Groups:/{print \$0}' /proc/1/status")
group_count=$(echo "$groups" | awk '{ print NF - 1 }')
[ "$group_count" -eq 1 ] && [ "$(echo "$groups" | awk '{ print $2 }')" = '1000' ] || {
  echo "unexpected supplementary process groups: $groups" >&2
  exit 1
}

PLAYWRIGHT_BASE_URL="http://127.0.0.1:$port" \
  PLAYWRIGHT_DEMO_EMAIL="$demo_email" \
  PLAYWRIGHT_DEMO_PASSWORD="$demo_password" \
  PLAYWRIGHT_POLISH_DISABLED=1 \
  pnpm exec playwright test tests/e2e/container-cache.spec.ts

if docker logs "$container_id" 2>&1 | rg -i 'EACCES|permission denied|prerender'; then
  echo 'Runtime logs contain a cache or permission error.' >&2
  exit 1
fi
docker rm --force "$container_id" >/dev/null
container_id=''

# A storage directory with no access must fail instead of being repaired by
# the image. The application remains fixed at node:node in this check.
mismatch_dir="$work_dir/mismatch"
prepare_data_dir "$mismatch_dir"
docker run --rm --entrypoint /bin/sh \
  --volume "$mismatch_dir:/app/data" \
  "$runtime_image" \
  -c 'chmod 000 /app/data'
if verify_mount_identity "$mismatch_dir" >/dev/null 2>&1; then
  echo 'storage preflight unexpectedly accepted an unusable directory.' >&2
  exit 1
fi
if verify_storage_contract "$mismatch_dir" >/dev/null 2>&1; then
  echo 'storage verification unexpectedly accepted an unusable directory.' >&2
  exit 1
fi

mismatch_log="$work_dir/mismatch.log"
if docker run --rm \
  --env DATABASE_URL=file:/app/data/aero-diary.db \
  --volume "$mismatch_dir:/app/data" \
  "$migration_image" >"$mismatch_log" 2>&1; then
  echo 'migration unexpectedly succeeded with unusable storage.' >&2
  cat "$mismatch_log" >&2
  exit 1
fi

docker run --rm --entrypoint /bin/sh \
  --volume "$mismatch_dir:/app/data" \
  "$runtime_image" \
  -c 'chmod 700 /app/data'
cleanup_data_dir "$mismatch_dir"
data_dir=''
echo 'Container acceptance passed at node:node (1000:1000).'

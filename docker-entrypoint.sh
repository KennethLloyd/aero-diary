#!/bin/sh

set -eu

readonly DATA_PATH=/app/data
readonly NEXT_RUNTIME_PATHS="/app/.next/server/app /app/.next/server/pages /app/.next/cache"
readonly SETPRIV=/usr/bin/setpriv

fail() {
  echo "Aero Diary container startup failed: $*" >&2
  exit 1
}

validate_identity_value() {
  name=$1
  value=$2

  case "$value" in
    ''|*[!0-9]*)
      fail "$name must be a positive decimal integer."
      ;;
    0*)
      fail "$name must be greater than zero."
      ;;
  esac
}

load_identity() {
  raw_uid=${AERO_DIARY_UID-}
  raw_gid=${AERO_DIARY_GID-}

  if [ -z "$raw_uid" ] && [ -z "$raw_gid" ]; then
    configured_uid=1000
    configured_gid=1000
  elif [ -z "$raw_uid" ] || [ -z "$raw_gid" ]; then
    fail "AERO_DIARY_UID and AERO_DIARY_GID must be set together."
  else
    configured_uid=$raw_uid
    configured_gid=$raw_gid
  fi

  validate_identity_value AERO_DIARY_UID "$configured_uid"
  validate_identity_value AERO_DIARY_GID "$configured_gid"

  [ -x "$SETPRIV" ] || fail "the base image must provide $SETPRIV."
}

run_as_configured() {
  if [ "$(id -u)" -eq 0 ]; then
    "$SETPRIV" \
      --reuid "$configured_uid" \
      --regid "$configured_gid" \
      --clear-groups \
      -- "$@"
  else
    "$@"
  fi
}

verify_directory_access() {
  path=$1
  label=$2

  run_as_configured test -d "$path" \
    && run_as_configured test -r "$path" \
    && run_as_configured test -w "$path" \
    && run_as_configured test -x "$path" \
    || fail "configured identity ${configured_uid}:${configured_gid} cannot read and write $label at $path. Prepare that path for the configured identity or set matching AERO_DIARY_UID and AERO_DIARY_GID values."
}

verify_data_access() {
  verify_directory_access "$DATA_PATH" "the SQLite data directory"

  if [ -e "$DATA_PATH/aero-diary.db" ]; then
    run_as_configured test -r "$DATA_PATH/aero-diary.db" \
      && run_as_configured test -w "$DATA_PATH/aero-diary.db" \
      || fail "configured identity ${configured_uid}:${configured_gid} cannot read and write the SQLite database at $DATA_PATH/aero-diary.db. Fix the mounted file permissions; the image will not change its ownership."
  fi
}

prepare_next_runtime_paths() {
  # These are the only image paths Next.js is allowed to update at runtime.
  # In particular, do not broaden this to /app or the private SQLite mount.
  for path in $NEXT_RUNTIME_PATHS; do
    mkdir -p "$path"
    chown -R "$configured_uid:$configured_gid" "$path"
  done
}

verify_next_runtime_access() {
  for path in $NEXT_RUNTIME_PATHS; do
    verify_directory_access "$path" "the Next.js runtime path"
  done
}

verify_pass_through_identity() {
  current_uid=$(id -u)
  current_gid=$(id -g)
  current_groups=$(id -G)

  if [ "$current_uid" != "$configured_uid" ] || [ "$current_gid" != "$configured_gid" ]; then
    fail "container was started as ${current_uid}:${current_gid}, but AERO_DIARY_UID:AERO_DIARY_GID is ${configured_uid}:${configured_gid}. Remove the Docker user override and set both environment variables, or use a matching non-root identity."
  fi

  if [ "$current_groups" != "$configured_gid" ]; then
    fail "container was started with supplementary groups ($current_groups). Start it through the root initializer or remove supplementary groups so the final process has only group ${configured_gid}."
  fi
}

drop_and_exec() {
  if [ "$(id -u)" -eq 0 ]; then
    exec "$SETPRIV" \
      --reuid "$configured_uid" \
      --regid "$configured_gid" \
      --clear-groups \
      -- "$@"
  fi

  exec "$@"
}

start_runtime() {
  if [ "$(id -u)" -eq 0 ]; then
    prepare_next_runtime_paths
  else
    verify_pass_through_identity
  fi

  verify_next_runtime_access
  verify_data_access
  drop_and_exec "$@"
}

start_migration() {
  if [ "$(id -u)" -ne 0 ]; then
    verify_pass_through_identity
  fi

  verify_data_access
  drop_and_exec "$@"
}

run_healthcheck() {
  if [ "$(id -u)" -ne 0 ]; then
    verify_pass_through_identity
  fi

  verify_next_runtime_access
  verify_data_access
  drop_and_exec node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
}

load_identity

case "${1-}" in
  --runtime)
    shift
    [ "$#" -gt 0 ] || fail "runtime command is missing."
    start_runtime "$@"
    ;;
  --migrate)
    shift
    [ "$#" -gt 0 ] || fail "migration command is missing."
    start_migration "$@"
    ;;
  --healthcheck)
    [ "$#" -eq 1 ] || fail "healthcheck does not accept command arguments."
    run_healthcheck
    ;;
  *)
    fail "unknown startup mode. Use the image entrypoint instead of replacing it."
    ;;
esac

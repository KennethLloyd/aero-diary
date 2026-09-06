#!/bin/sh

set -eu

data_dir=${1:-data}
expected_identity=1000:1000

if [ ! -d "$data_dir" ]; then
  echo "Container storage directory does not exist: $data_dir" >&2
  exit 1
fi

stat_identity() {
  if stat -c '%u:%g' "$1" >/dev/null 2>&1; then
    stat -c '%u:%g' "$1"
  else
    stat -f '%u:%g' "$1"
  fi
}

actual_identity=$(stat_identity "$data_dir")
if [ "$actual_identity" != "$expected_identity" ]; then
  echo "Container storage must be owned by $expected_identity; found $actual_identity at $data_dir." >&2
  echo "Back up the database, prepare the bind mount explicitly, then rerun this check." >&2
  exit 1
fi

if [ ! -r "$data_dir" ] || [ ! -w "$data_dir" ] || [ ! -x "$data_dir" ]; then
  echo "Container storage must be readable, writable, and searchable by $expected_identity: $data_dir" >&2
  echo "Back up the database, prepare the bind mount explicitly, then rerun this check." >&2
  exit 1
fi

permissions=$(stat -c '%a' "$data_dir" 2>/dev/null || stat -f '%Lp' "$data_dir")
case "$permissions" in
  *[2367])
    echo "Container storage must not be world-writable: $data_dir" >&2
    exit 1
    ;;
esac

for database_file in "$data_dir"/aero-diary.db "$data_dir"/aero-diary.db-*; do
  [ -f "$database_file" ] || continue
  file_identity=$(stat_identity "$database_file")
  if [ "$file_identity" != "$expected_identity" ]; then
    echo "Container database file must be owned by $expected_identity; found $file_identity at $database_file." >&2
    exit 1
  fi
  if [ ! -r "$database_file" ] || [ ! -w "$database_file" ]; then
    echo "Container database file must be readable and writable by $expected_identity: $database_file" >&2
    exit 1
  fi
done

echo "Container storage is prepared for $expected_identity: $data_dir"

#!/usr/bin/env bash
# Test restore for the nightly backup (chunk F9).
#
# Usage: verify-restore.sh <folder with roles.sql, schema.sql, data.sql> <database url>
#
# Restores the three files into an empty Supabase database the same way a real
# restore would (see supabase/README.md, "Backups"), then checks that every
# table holds exactly as many rows as the backup file has for it.
#
# Prints only totals, never row contents: the logs of this public repository
# can be read by anyone.
set -euo pipefail

dir="$1"
db="$2"

for f in roles.sql schema.sql data.sql; do
  if [ ! -s "$dir/$f" ]; then
    echo "::error::Backup file $f is missing or empty."
    exit 1
  fi
done

psql "$db" --quiet --no-psqlrc --single-transaction -v ON_ERROR_STOP=1 -o /dev/null \
  --file "$dir/roles.sql" \
  --file "$dir/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$dir/data.sql"

# Rows per table in the backup: one line per row between a COPY line and "\.".
expected="$(mktemp)"
awk '
  /^COPY "[^"]+"\."[^"]+" / { split($2, p, "."); t = p[1] "." p[2]; n = 0; inside = 1; next }
  inside && $0 == "\\." { print t "\t" n; inside = 0; next }
  inside { n++ }
' "$dir/data.sql" > "$expected"

tables=0
rows=0
mismatched=0
while IFS=$'\t' read -r table want; do
  got="$(psql "$db" --no-psqlrc -tA -c "select count(*) from $table")"
  tables=$((tables + 1))
  rows=$((rows + want))
  if [ "$got" != "$want" ]; then
    echo "::error::$table has $got rows after restore; the backup has $want."
    mismatched=$((mismatched + 1))
  fi
done < "$expected"
bad=$mismatched

public_tables="$(psql "$db" --no-psqlrc -tA -c "select count(*) from pg_tables where schemaname = 'public'")"
policies="$(psql "$db" --no-psqlrc -tA -c "select count(*) from pg_policies where schemaname = 'public'")"

if [ "$public_tables" -eq 0 ]; then
  echo "::error::No app tables after restore."
  bad=$((bad + 1))
fi
if [ "$policies" -eq 0 ]; then
  echo "::error::No row-level security policies after restore."
  bad=$((bad + 1))
fi

echo "Restored $public_tables app tables with $policies security policies."
echo "Checked $tables tables holding $rows rows in total: $((tables - mismatched)) match."
[ "$bad" -eq 0 ]

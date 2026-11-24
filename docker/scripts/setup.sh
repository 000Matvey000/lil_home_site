#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
DOCKER_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(CDPATH= cd -- "$DOCKER_DIR/.." && pwd)"
ENV_FILE="$DOCKER_DIR/.env"
ENV_TEMPLATE="$DOCKER_DIR/.env.example"
DATA_DIR="$ROOT_DIR/data"

if [ ! -f "$ENV_FILE" ]; then
  cp "$ENV_TEMPLATE" "$ENV_FILE"
  echo "Created $ENV_FILE from template."
fi

if grep -q "^JWT_SECRET=replace-with-a-random-secret$" "$ENV_FILE"; then
  JWT_SECRET="$(node -e "const c=require('node:crypto');console.log(c.randomBytes(32).toString('hex'))")"
  TMP_FILE="$ENV_FILE.tmp"
  sed "s/^JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" "$ENV_FILE" > "$TMP_FILE"
  mv "$TMP_FILE" "$ENV_FILE"
  echo "Generated JWT_SECRET in $ENV_FILE."
fi

mkdir -p "$DATA_DIR"
echo "Ensured data directory exists at $DATA_DIR."

echo "Docker setup complete."

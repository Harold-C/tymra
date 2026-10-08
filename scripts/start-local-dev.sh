#!/bin/sh
set -eu

cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

docker compose build web
docker compose stop web worker api
docker compose run --rm --no-deps dependencies
docker compose run --rm --no-deps migrate ./node_modules/.bin/prisma generate --schema prisma/schema.prisma
docker compose up --detach

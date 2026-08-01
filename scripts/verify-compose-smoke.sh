#!/bin/zsh

set -euo pipefail

readonly PROJECT_DIR="${0:A:h:h}"
readonly COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.smoke.yml)
readonly PROJECT_NAME="tymra-smoke"

cleanup() {
  docker compose -p "${PROJECT_NAME}" "${COMPOSE_FILES[@]}" down --volumes --remove-orphans || true
  docker image rm tymra-app-smoke:local >/dev/null 2>&1 || true
}

wait_for_url() {
  local url="$1"

  for _ in {1..60}; do
    if curl --silent --show-error --fail --max-time 5 --output /dev/null "${url}" 2>/dev/null; then
      return 0
    fi
    sleep 2
  done

  printf 'Timed out waiting for %s\n' "${url}" >&2
  return 1
}

cd "${PROJECT_DIR}"
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker compose -p "${PROJECT_NAME}" "${COMPOSE_FILES[@]}" build web
docker compose -p "${PROJECT_NAME}" "${COMPOSE_FILES[@]}" up --detach
wait_for_url "http://127.0.0.1:3400/worker/readiness"
wait_for_url "http://127.0.0.1:3300/en"
wait_for_url "http://127.0.0.1:58025/api/v1/messages"

printf 'Tymra Compose smoke environment is healthy.\n'

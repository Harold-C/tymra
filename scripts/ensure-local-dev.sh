#!/bin/zsh

set -uo pipefail

readonly PROJECT_DIR="/Users/haroldchen/Documents/project/nbc-tymra"
readonly TRAEFIK_CONTAINER="host-traefik-1"
readonly PUBLIC_URL="https://tymra.test/en"
readonly ADMIN_URL="https://ops.tymra.test/admin/sign-in"
readonly WORKER_URL="https://worker.tymra.test/worker/readiness"
readonly MAILPIT_URL="https://mail.tymra.test/"
readonly REQUIRED_SERVICES=(postgres redis web worker api scheduler mailpit)

find_docker() {
  for candidate in /usr/local/bin/docker /opt/homebrew/bin/docker; do
    [[ -x "${candidate}" ]] && { printf '%s' "${candidate}"; return 0; }
  done
  return 1
}

log() {
  printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"
}

url_is_healthy() {
  /usr/bin/curl --insecure --silent --show-error --fail --max-time 8 \
    --output /dev/null "$1" 2>/dev/null
}

readonly DOCKER="$(find_docker)" || {
  log "Docker CLI is unavailable; Tymra cannot be checked."
  exit 1
}

if ! "${DOCKER}" info >/dev/null 2>&1; then
  log "Docker Desktop is unavailable; Tymra cannot be checked."
  exit 1
fi

if ! "${DOCKER}" inspect --format '{{.State.Running}}' "${TRAEFIK_CONTAINER}" 2>/dev/null | /usr/bin/grep -q true; then
  log "Starting shared Traefik."
  "${DOCKER}" start "${TRAEFIK_CONTAINER}" >/dev/null || exit 1
fi

running_services="$(cd "${PROJECT_DIR}" && "${DOCKER}" compose ps --status running --services 2>/dev/null)"
for service in "${REQUIRED_SERVICES[@]}"; do
  if ! printf '%s\n' "${running_services}" | /usr/bin/grep -qx "${service}"; then
    log "Tymra service ${service} is not running; restoring the Compose stack."
    (cd "${PROJECT_DIR}" && "${DOCKER}" compose up --detach) || exit 1
    break
  fi
done

for _ in {1..30}; do
  if url_is_healthy "${PUBLIC_URL}" \
    && url_is_healthy "${ADMIN_URL}" \
    && url_is_healthy "${WORKER_URL}" \
    && url_is_healthy "${MAILPIT_URL}"; then
    exit 0
  fi
  /bin/sleep 2
done

log "One or more Tymra HTTPS routes remain unhealthy."
exit 1

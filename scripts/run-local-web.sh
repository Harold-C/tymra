#!/bin/zsh

set -o pipefail

readonly PROJECT_DIR="${0:A:h:h}"
readonly PNPM_BIN="/Users/haroldchen/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm"

"${PNPM_BIN}" --dir "${PROJECT_DIR}" --filter @tymra/web dev 2>&1 | /usr/bin/perl -pe '
  BEGIN { $| = 1 }
  s{(/(?:en|zh)/result/)[^?\s]+}{${1}[redacted]}g;
  s{(/api/v1/results/)[^/?\s]+}{${1}[redacted]}g;
'

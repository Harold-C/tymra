#!/bin/zsh

set -o pipefail

readonly NODE_BIN="/Users/haroldchen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
readonly NEXT_BIN="/Users/haroldchen/Documents/project/nbc-tymra/node_modules/next/dist/bin/next"

"${NODE_BIN}" "${NEXT_BIN}" dev 2>&1 | /usr/bin/perl -pe '
  BEGIN { $| = 1 }
  s{(/(?:en|zh)/result/)[^?\s]+}{${1}[redacted]}g;
  s{(/api/v1/results/)[^/?\s]+}{${1}[redacted]}g;
'

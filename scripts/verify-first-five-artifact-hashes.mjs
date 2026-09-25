import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";

if (process.argv.length !== 3) throw new Error("Usage: node scripts/verify-first-five-artifact-hashes.mjs SNAPSHOT.json < streamed-artifacts");
const snapshot = JSON.parse(await readFile(process.argv[2], "utf8"));
const expected = new Map((snapshot.sources ?? []).map((source) => [source.latestRunId, {
  source: source.key, count: source.latestRunRetainedArtifacts, observed: 0,
}]));
if (expected.size !== 5 || [...expected].some(([runId, item]) => !runId || !Number.isInteger(item.count) || item.count < 1)) {
  throw new Error("Snapshot does not contain five latest scheduled runs with retained artifacts");
}

const mismatches = [];
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  if (!line.trim()) continue;
  const record = JSON.parse(line);
  const item = expected.get(record.collectionRunId);
  if (!item) throw new Error("Artifact stream contains a run outside the approved snapshot");
  item.observed += 1;
  const actual = createHash("sha256").update(JSON.stringify(canonicalJson(record.payload))).digest("hex");
  if (actual !== record.contentHash) mismatches.push(record.artifactId);
}
const counts = [...expected.values()].map((item) => ({ source: item.source, expected: item.count, observed: item.observed }));
const passed = mismatches.length === 0 && counts.every((item) => item.expected === item.observed);
process.stdout.write(`${JSON.stringify({ passed, counts, mismatchArtifactIds: mismatches })}\n`);
if (!passed) process.exitCode = 1;

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalJson(item)]));
  }
  return value;
}

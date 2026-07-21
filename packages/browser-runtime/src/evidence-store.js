import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const SAFE_TRACE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export class LocalEvidenceStore {
  constructor({ evidenceRoot, traceId }) {
    if (!SAFE_TRACE.test(traceId ?? "")) throw new Error("Invalid evidence traceId");
    this.evidenceRoot = path.resolve(evidenceRoot);
    this.traceId = traceId;
    this.traceDir = path.join(this.evidenceRoot, traceId);
  }

  async recordArtifact({ kind, artifact, fileName, containsSensitiveData = false }) {
    const name = fileName ?? defaultFileName(kind);
    if (path.basename(name) !== name) throw new Error("Evidence fileName must not contain a path");
    const buffer = toBuffer(artifact);
    await fs.mkdir(this.traceDir, { recursive: true });
    const target = path.join(this.traceDir, name);
    const temporary = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temporary, buffer, { mode: 0o600 });
    await fs.rename(temporary, target);
    return {
      kind,
      traceId: this.traceId,
      relativePath: path.posix.join(this.traceId, name),
      sha256: createHash("sha256").update(buffer).digest("hex"),
      sizeBytes: buffer.byteLength,
      containsSensitiveData,
      createdAt: new Date().toISOString(),
    };
  }

  async writeManifest(result, artifacts) {
    return this.recordArtifact({
      kind: "manifest_json",
      fileName: "manifest.json",
      artifact: {
        schemaVersion: 1,
        traceId: this.traceId,
        status: result.status,
        readonlyOnly: true,
        externalSideEffectsPerformed: false,
        createdAt: new Date().toISOString(),
        artifacts,
      },
    });
  }
}

export async function cleanupExpiredEvidence(evidenceRoot, retention, now = Date.now()) {
  const root = path.resolve(evidenceRoot);
  const { successTtlHours, failureTtlHours } = retentionPolicy(retention);
  await fs.mkdir(root, { recursive: true });
  const entries = await fs.readdir(root, { withFileTypes: true });
  let deleted = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !SAFE_TRACE.test(entry.name)) continue;
    const target = path.join(root, entry.name);
    const stat = await fs.stat(target);
    const ttlHours = await evidenceTtlHours(target, successTtlHours, failureTtlHours);
    if (now - stat.mtimeMs < ttlHours * 3_600_000) continue;
    await fs.rm(target, { recursive: true, force: true });
    deleted += 1;
  }
  return { deleted };
}

export async function markEvidenceParserFailure(evidenceRoot, traceId) {
  if (!SAFE_TRACE.test(traceId ?? "")) throw new Error("Invalid evidence traceId");
  const traceDir = path.join(path.resolve(evidenceRoot), traceId);
  await fs.access(traceDir);
  await fs.writeFile(path.join(traceDir, ".parser-failure"), `${new Date().toISOString()}\n`, { mode: 0o600 });
}

function retentionPolicy(retention) {
  if (typeof retention === "number") return { successTtlHours: retention, failureTtlHours: retention };
  return {
    successTtlHours: retention.successTtlHours,
    failureTtlHours: retention.failureTtlHours,
  };
}

async function evidenceTtlHours(traceDir, successTtlHours, failureTtlHours) {
  try {
    await fs.access(path.join(traceDir, ".parser-failure"));
    return failureTtlHours;
  } catch {}
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(traceDir, "manifest.json"), "utf8"));
    return manifest.status === "failed" || manifest.status === "manual_required"
      ? failureTtlHours
      : successTtlHours;
  } catch {
    return successTtlHours;
  }
}

function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") return Buffer.from(value);
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function defaultFileName(kind) {
  if (kind === "screenshot") return "screenshot.png";
  if (kind === "html") return "page.html";
  if (kind === "result_json") return "result.json";
  if (kind === "error_json") return "error.json";
  if (kind === "manifest_json") return "manifest.json";
  return `${kind}.txt`;
}

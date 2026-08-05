import path from "node:path";

const retainedEvidencePrefix = "tymra-evidence:";

export function resolveRetainedEvidencePath(root: string, storageRef: string): string {
  if (!storageRef.startsWith(retainedEvidencePrefix)) throw new Error("Artifact does not reference retained evidence");
  const relativePath = storageRef.slice(retainedEvidencePrefix.length);
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error("Artifact evidence path is invalid");
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  if (!resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("Artifact evidence path escapes its root");
  return resolvedPath;
}

export function artifactMediaType(artifactType: string): string {
  if (artifactType.includes("SCREENSHOT")) return "image/png";
  return "text/plain; charset=utf-8";
}

export function canReadArtifactContent(input: { artifactType: string; storageRef: string; containsSensitiveData: boolean; deletedAt: Date | null }): boolean {
  return !input.containsSensitiveData
    && !input.deletedAt
    && input.storageRef.startsWith(retainedEvidencePrefix)
    && !input.artifactType.includes("PROFILE");
}

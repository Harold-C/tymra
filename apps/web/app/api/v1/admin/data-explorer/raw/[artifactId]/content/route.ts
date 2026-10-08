import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { prisma } from "@tymra/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiException } from "@/lib/server/api";
import { getAdminFromRequest } from "@/lib/server/admin-auth";
import { artifactMediaType, canReadArtifactContent, resolveRetainedEvidencePath } from "@/lib/server/raw-artifact-content";
import { writeServiceAudit } from "@/lib/server/service-recovery";

const maxArtifactBytes = 10 * 1024 * 1024;

export async function GET(request: NextRequest, { params }: { params: { artifactId: string } }) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return apiError(403, "FORBIDDEN", "Administrator access is required.");
    const artifact = await prisma.rawArtifact.findUnique({ where: { id: params.artifactId } });
    if (!artifact) return apiError(404, "NOT_FOUND", "Artifact not found.");
    if (!canReadArtifactContent(artifact)) return apiError(403, "ARTIFACT_CONTENT_BLOCKED", "Artifact content is not available for viewing.");

    const root = await fs.realpath(process.env.ARGUS_EVIDENCE_ROOT ?? "/argus-evidence");
    const target = await fs.realpath(resolveRetainedEvidencePath(root, artifact.storageRef));
    if (!target.startsWith(`${root}${path.sep}`)) return apiError(403, "ARTIFACT_CONTENT_BLOCKED", "Artifact content is outside retained storage.");
    const stat = await fs.stat(target);
    if (!stat.isFile() || stat.size > maxArtifactBytes) return apiError(413, "ARTIFACT_TOO_LARGE", "Artifact content cannot be displayed.");
    const content = await fs.readFile(target);
    const contentHash = createHash("sha256").update(content).digest("hex");
    if (contentHash !== artifact.contentHash) return apiError(409, "ARTIFACT_HASH_MISMATCH", "Artifact integrity verification failed.");
    await prisma.$transaction(tx => writeServiceAudit(tx, admin.id, "admin_evidence_content_access", "RawArtifact", artifact.id, { checksum: contentHash, bytes: content.length, collectionRunId: artifact.collectionRunId }));

    return new NextResponse(new Uint8Array(content), {
      status: 200,
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `inline; filename="${path.basename(target).replaceAll('"', "")}"`,
        "content-security-policy": "sandbox; default-src 'none'",
        "content-type": artifactMediaType(artifact.artifactType),
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return apiException(error);
  }
}

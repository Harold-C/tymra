import { NextRequest } from "next/server";
import { z } from "zod";
import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { previewMappingRepair, repairListingMapping } from "@/lib/server/service-data-repair";
import { ServiceRecoveryError, writeServiceAudit } from "@/lib/server/service-recovery";
import { prisma } from "@tymra/db";
const schema = z.object({ action: z.enum(["PREVIEW", "REPAIR"]), input: z.unknown() }).strict();
export async function POST(request: NextRequest, { params }: { params: { listingId: string } }) {
  try {
    const admin = await getAdminFromRequest(request); if (!admin || !isSameOrigin(request)) return apiError(403, "FORBIDDEN", "Administrator access and same origin required.");
    const { action, input } = schema.parse(await request.json());
    if (action === "REPAIR") return apiSuccess(await repairListingMapping(params.listingId, input, admin.id));
    const preview = await previewMappingRepair(params.listingId, input);
    await prisma.$transaction(tx => writeServiceAudit(tx, admin.id, "mapping_repair_preview", "Listing", params.listingId, { artifactId: preview.artifact.id, artifactHash: preview.artifact.contentHash, previewHash: preview.previewHash }));
    return apiSuccess({ previewHash: preview.previewHash, previousUnitId: preview.listing.unitId, targetUnitId: preview.unit.id, quarantinedObservations: preview.observations.length, withdrawnResults: preview.results.length, affectedCheckIds: preview.checkIds });
  } catch(error) { if (error instanceof ServiceRecoveryError) return apiError(error.statusCode, error.code, error.message); return apiException(error); }
}

import { NextRequest, NextResponse } from "next/server";
import { apiError, apiException } from "@/lib/server/api";
import { downloadCustomerExport } from "@/lib/server/customer-data-export";
import { CustomerAuthenticationError, requireCustomerSession } from "@/lib/server/membership/customer-auth";
import { ServiceRecoveryError } from "@/lib/server/service-recovery";
export async function GET(request: NextRequest, { params }: { params: { requestId: string } }) {
  try {
    const session = await requireCustomerSession(request);
    const result = await downloadCustomerExport(params.requestId, session.customerUserId);
    return new NextResponse(result.data, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="tymra-personal-data.json"', "cache-control": "private, no-store", "x-content-type-options": "nosniff", "x-export-checksum": result.checksum } });
  } catch(error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    if (error instanceof ServiceRecoveryError) return apiError(error.statusCode, error.code, error.message);
    return apiException(error);
  }
}

import { getEnvironment } from "@tymra/config";
import { encryptPersonalData, hashPersonalIdentifier, prisma } from "@tymra/db";
import { localeSchema } from "@tymra/domain";
import { z } from "zod";

import { apiException, apiSuccess } from "@/lib/server/api";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  locale: localeSchema,
  country: z.string().min(2).max(80),
  market: z.string().max(120).optional(),
  input: z.string().max(500).optional(),
  marketingConsent: z.boolean(),
  idempotencyKey: z.string().min(16).max(200),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const environment = getEnvironment();
    const entry = await prisma.waitlistEntry.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      create: {
        emailHash: hashPersonalIdentifier(input.email, environment.ACCESS_KEY_SECRET),
        encryptedEmail: encryptPersonalData(input.email, environment.DATA_ENCRYPTION_KEY),
        locale: input.locale,
        country: input.country,
        market: input.market,
        input: input.input,
        marketingConsent: input.marketingConsent,
        idempotencyKey: input.idempotencyKey,
      },
      update: {},
    });
    return apiSuccess({ waitlistId: entry.id }, { status: 201 });
  } catch (error) {
    return apiException(error);
  }
}

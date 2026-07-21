import { getEnvironment } from "@tymra/config";
import { encryptPersonalData, hashPersonalIdentifier, prisma } from "@tymra/db";
import { localeSchema } from "@tymra/domain";
import { z } from "zod";

import { apiException, apiSuccess, createReferenceId } from "@/lib/server/api";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  topic: z.string().trim().min(2).max(120),
  message: z.string().trim().min(10).max(5_000),
  checkId: z.string().trim().max(120).optional(),
  locale: localeSchema,
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const environment = getEnvironment();
    const referenceId = createReferenceId();
    const contact = await prisma.contactRequest.create({
      data: {
        name: input.name,
        emailHash: hashPersonalIdentifier(input.email, environment.ACCESS_KEY_SECRET),
        encryptedEmail: encryptPersonalData(input.email, environment.DATA_ENCRYPTION_KEY),
        topic: input.topic,
        message: input.message,
        checkId: input.checkId || null,
        locale: input.locale,
        referenceId,
      },
    });
    return apiSuccess({ contactId: contact.id, referenceId }, { status: 201 });
  } catch (error) {
    return apiException(error);
  }
}

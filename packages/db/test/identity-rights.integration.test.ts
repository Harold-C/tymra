import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "../src";

describe("identity history and provider publication rights", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("keeps a deterministic merge record linked to the canonical Property", async () => {
    const alias = await prisma.property.findUniqueOrThrow({
      where: { id: "demo-property-central-legacy-alias" },
    });
    const history = await prisma.identityMerge.findUniqueOrThrow({
      where: { id: "demo-identity-merge-property-central" },
    });

    expect(alias.mergedIntoId).toBe("demo-property-central");
    expect(history).toMatchObject({
      entityType: "Property",
      fromId: alias.id,
      toId: alias.mergedIntoId,
    });
  });

  it("does not treat an approved source as publishable when its rights are blocked", async () => {
    const source = await prisma.dataSource.findUniqueOrThrow({
      where: { key: "development-rights-blocked" },
    });
    const mayPublish = source.status === "APPROVED"
      && source.enabled
      && source.rightsAllowStorage
      && source.rightsAllowDerivedAnalysis
      && source.rightsAllowDisplay;

    expect(source.status).toBe("APPROVED");
    expect(mayPublish).toBe(false);
  });
});

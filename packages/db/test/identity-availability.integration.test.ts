import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "../src";

describe("identity history and source availability", () => {
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

  it("does not treat an operationally blocked source as available", async () => {
    const source = await prisma.dataSource.findUniqueOrThrow({
      where: { key: "development-operational-blocked" },
    });
    const mayPublish = source.enabled && source.operationalStatus === "HEALTHY";

    expect(source.operationalStatus).toBe("BLOCKED");
    expect(mayPublish).toBe(false);
  });
});

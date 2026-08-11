import { describe, expect, it } from "vitest";

import { getAccountMetadata, type AccountMetadataPage } from "./account-metadata";

const pages: AccountMetadataPage[] = [
  "overview",
  "pricingUnits",
  "pricingUnitDetail",
  "checks",
  "checkDetail",
  "calendar",
  "alerts",
  "billing",
  "settings",
  "exports",
  "integrations",
  "portfolio",
];

describe("getAccountMetadata", () => {
  it.each(["en", "zh"] as const)("provides a unique title for every %s account page", (locale) => {
    const titles = pages.map((page) => getAccountMetadata(locale, page).title);

    expect(new Set(titles).size).toBe(pages.length);
    expect(titles.every((title) => typeof title === "string" && title.endsWith(" | Tymra"))).toBe(true);
  });

  it("keeps private account pages out of search indexes", () => {
    expect(getAccountMetadata("en", "overview").robots).toEqual({ index: false, follow: false });
  });
});

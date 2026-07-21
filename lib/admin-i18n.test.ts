import { describe, expect, it } from "vitest";

import { adminLabel, adminText, formatAdminValue, normalizeAdminLocale } from "./admin-i18n";

describe("admin i18n", () => {
  it("defaults unknown locales to English", () => {
    expect(normalizeAdminLocale(undefined)).toBe("en");
    expect(normalizeAdminLocale("fr")).toBe("en");
  });

  it("translates shared interface labels and status values", () => {
    expect(adminText("zh", "navExceptions")).toBe("异常处理");
    expect(adminLabel("zh", "Collection Run")).toBe("采集运行");
    expect(formatAdminValue("zh", "IN_PROGRESS")).toBe("处理中");
    expect(formatAdminValue("en", "IN_PROGRESS")).toBe("IN PROGRESS");
  });
});

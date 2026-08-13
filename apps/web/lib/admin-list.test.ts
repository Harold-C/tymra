import { describe, expect, it } from "vitest";

import { adminListHref, adminListState } from "./admin-list";

describe("admin list state", () => {
  it("uses bounded supported page sizes", () => {
    expect(adminListState({ page: "3", pageSize: "50" })).toEqual({ page: 3, pageSize: 50, skip: 100 });
    expect(adminListState({ page: "-1", pageSize: "5000" })).toEqual({ page: 1, pageSize: 25, skip: 0 });
  });

  it("preserves filters while changing pagination", () => {
    expect(adminListHref("/admin/checks", { status: "FAILED", page: "2", pageSize: "25" }, { page: 3 })).toBe("/admin/checks?status=FAILED&pageSize=25&page=3");
  });
});

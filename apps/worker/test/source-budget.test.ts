import { describe, expect, it } from "vitest";

import { dailySourceBudgetExceeded } from "../src/collection/source-budget";

describe("event source daily request budget", () => {
  it("does not cap cumulative requests in development", () => {
    expect(dailySourceBudgetExceeded("development", 20, 0, 1, 20)).toBe(false);
    expect(dailySourceBudgetExceeded("development", 2_500, 10, 2, 2_500)).toBe(false);
  });

  it("keeps the daily cap outside development", () => {
    expect(dailySourceBudgetExceeded("production", 19, 0, 1, 20)).toBe(false);
    expect(dailySourceBudgetExceeded("production", 19, 0, 2, 20)).toBe(true);
    expect(dailySourceBudgetExceeded("test", 20, 0, 1, 20)).toBe(true);
  });
});

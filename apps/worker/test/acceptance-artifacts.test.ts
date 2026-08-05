import { describe, expect, it } from "vitest";

import { acceptanceMarkdown } from "../src/operations/acceptance-artifacts";

describe("acceptance artifacts", () => {
  it("renders a concise durable summary", () => {
    const markdown = acceptanceMarkdown({ acceptanceId: "accept-1", startedAt: "2026-08-06T00:00:00Z", finishedAt: "2026-08-06T00:00:01Z", durationMs: 1_000, sourceCount: 2, passCount: 4, enabledSchedulesBefore: 0, enabledSchedulesAfter: 0, activeAcceptanceExecutions: 0, passed: true, failures: [] });
    expect(markdown).toContain("Public-source acceptance — PASSED");
    expect(markdown).toContain("- None");
  });
});

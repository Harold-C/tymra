import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { parseAcceptanceProcessOutput, resolveFrozenAcceptanceDates } from "../src/ota-soak-process";

describe("OTA soak acceptance process output", () => {
  it("retains a valid failure report even when acceptance exits non-zero", () => {
    const report = parseAcceptanceProcessOutput<{ allSourcesCompleted: boolean }>(
      "$ tsx src/accept-ota-argus.ts\n{\n  \"allSourcesCompleted\": false,\n  \"message\": \"brace: } and quote: \\\"\"\n}\n[ELIFECYCLE] Command failed\n",
      1,
    );
    assert.deepEqual(report, { allSourcesCompleted: false, message: "brace: } and quote: \"" });
  });

  it("fails explicitly when a crashed acceptance produced no report", () => {
    assert.throws(
      () => parseAcceptanceProcessOutput("connector crashed\n", 1),
      /exited 1 without a valid report/u,
    );
  });

  it("freezes the same OTA acceptance dates across different New Zealand days", () => {
    const first = resolveFrozenAcceptanceDates({}, undefined, ["booking", "airbnb"], "2026-08-19");
    const resumed = resolveFrozenAcceptanceDates({}, first, ["booking", "airbnb"], "2026-08-20");
    assert.deepEqual(first, {
      ACCEPTANCE_CHECK_IN: "2026-09-18",
      ACCEPTANCE_CHECK_OUT: "2026-09-19",
    });
    assert.deepEqual(resumed, first);
  });

  it("rejects a date override that differs from the frozen checkpoint", () => {
    assert.throws(
      () => resolveFrozenAcceptanceDates(
        { ACCEPTANCE_AIRBNB_CHECK_IN: "2026-08-25" },
        {
          ACCEPTANCE_CHECK_IN: "2026-09-18",
          ACCEPTANCE_CHECK_OUT: "2026-09-19",
          ACCEPTANCE_AIRBNB_CHECK_IN: "2026-08-24",
        },
        ["airbnb"],
        "2026-08-20",
      ),
      /differs from the frozen OTA soak checkpoint/u,
    );
  });
});

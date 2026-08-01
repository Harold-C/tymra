import { AdapterError } from "@tymra/providers";
import { describe, expect, it } from "vitest";

import { classifyJobFailure } from "../src/jobs/job-failure";
import { WorkerRequestError } from "../src/services/worker-service";

describe("worker job failure classification", () => {
  it("does not retry terminal collection failures", () => {
    expect(classifyJobFailure(new AdapterError("RIGHTS_BLOCKED", "not approved", false))).toMatchObject({ code: "RIGHTS_BLOCKED", retryable: false });
    expect(classifyJobFailure(new AdapterError("PARSING_ERROR", "invalid source shape", false))).toMatchObject({ code: "PARSING_ERROR", retryable: false });
    expect(classifyJobFailure(new WorkerRequestError("INVALID_COLLECTION_RANGE", "bad range", 422))).toMatchObject({ code: "INVALID_COLLECTION_RANGE", retryable: false });
  });

  it("retries transient source and unknown failures", () => {
    expect(classifyJobFailure(new AdapterError("SOURCE_UNAVAILABLE", "upstream timeout", true))).toMatchObject({ code: "SOURCE_UNAVAILABLE", retryable: true });
    expect(classifyJobFailure(new Error("database disconnected"))).toMatchObject({ code: "JOB_HANDLER_ERROR", retryable: true });
  });
});

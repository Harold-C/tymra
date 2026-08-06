type RetryAwareError = Error & { code?: unknown; retryable?: unknown };

const terminalCodes = new Set([
  "CONFIGURATION_ERROR",
  "INVALID_INPUT",
  "INVALID_COLLECTION_MODE",
  "INVALID_COLLECTION_RANGE",
  "INVALID_MARKET_SCOPE",
  "PARSING_ERROR",
  "SOURCE_NOT_FOUND",
]);

export function classifyJobFailure(error: unknown) {
  const candidate = error instanceof Error ? error as RetryAwareError : null;
  const code = typeof candidate?.code === "string" ? candidate.code : "JOB_HANDLER_ERROR";
  const message = candidate?.message ?? "Unknown worker error";
  const retryable = typeof candidate?.retryable === "boolean"
    ? candidate.retryable
    : !terminalCodes.has(code);
  return { code, message, retryable };
}

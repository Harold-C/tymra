export function directEventHttpFailure(source: "eventfinda" | "ticketmaster", status: number) {
  if (status === 200) return null;
  if (status === 202 || status === 403 || status === 429) {
    return { code: "RATE_LIMITED" as const, message: `${source} returned HTTP ${status}; public collection stopped for review`, retryable: true };
  }
  return {
    code: "SOURCE_UNAVAILABLE" as const,
    message: `${source} returned HTTP ${status}`,
    retryable: status >= 500,
  };
}

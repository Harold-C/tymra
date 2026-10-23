/** Technical failure consumes only its task key; it never grants an automatic retry. */
export function selectedFailureScope(reason: string, retryable?: boolean | null): "window" | "member" | "source" {
  if (/CHALLENGE|CAPTCHA|LOGIN|RATE_LIMIT|BLOCKED|ACCESS_DENIED|SOURCE_DAILY_BUDGET_EXHAUSTED|SOURCE_CIRCUIT_OPEN/.test(reason)) return "source";
  if (reason === "SELECTED_DAILY_WINDOW_EXPIRED"
    || (retryable === true && ["NAVIGATION_ERROR", "TIMEOUT"].includes(reason))) return "window";
  return "member";
}

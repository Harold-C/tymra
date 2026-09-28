export function dailySourceBudgetExceeded(
  nodeEnv: string,
  usedToday: number,
  requestsThisRun: number,
  nextRequestCost: number,
  dailyBudget: number,
): boolean {
  return nodeEnv !== "development" && usedToday + requestsThisRun + nextRequestCost > dailyBudget;
}

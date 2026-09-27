const nzClock = new Intl.DateTimeFormat("en-NZ", {
  timeZone: "Pacific/Auckland",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Defer automatic collection due during New Zealand weekday office hours. */
export function nextCollectionOutsideOfficeHours(now: Date): Date {
  const parts = Object.fromEntries(nzClock.formatToParts(now).map((part) => [part.type, part.value]));
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return now;
  const hour = Number(parts.hour);
  if (hour < 9 || hour >= 17) return now;
  const remainingMs = ((17 - hour) * 3_600 - Number(parts.minute) * 60 - Number(parts.second)) * 1_000
    - now.getUTCMilliseconds();
  return new Date(now.getTime() + remainingMs);
}

import { afterEach, describe, expect, it, vi } from "vitest";

import { parseChristchurchSports } from "../src/christchurch-demand-adapters";
import { publicDataAdapters } from "../src/public/registry";

const crusadersUrl = "https://www.crusaders.co.nz/fixtures/draw/";
const context = {
  mode: "live" as const, correlationId: "sports-regression", locale: "en" as const, currency: "NZD" as const,
  collectionRange: { from: new Date("2026-10-10T11:00:00Z"), to: new Date("2027-01-08T11:00:00Z") },
  collectionLimits: { maxRequests: 3, maxRecords: 2, maxBytes: 2_000_000, timeoutMs: 30_000 },
};
const row = (round: string, date: string, title: string, venue: string) =>
  "<tr><td>" + [round, date, title, venue, "-", ""].join("</td><td>") + "</td></tr>";
const draw = (rows: string, year = "2027") =>
  '<h1 class="c-opta-data-block__heading">' + year + ' Super Rugby Pacific Draw</h1><table class="c-fixture-table"><tbody>' + rows + "</tbody></table>";

function mockPages(pages: Record<string, string>, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const response = new Response(pages[url] ?? "<h1>Unknown page</h1>", { status, headers: { "content-type": "text/html" } });
    Object.defineProperty(response, "url", { value: url });
    return response;
  });
}

afterEach(() => vi.restoreAllMocks());

describe("Christchurch Sports production regressions", () => {
  it("recognizes confirmed stadium aliases without admitting away venues or changing occurrence IDs", () => {
    const events = parseChristchurchSports(draw(
      row("1", "Fri 12 Feb | 07:35 PM", "Crusaders V Reds", "One New Zealand Stadium")
      + row("2", "Fri 19 Feb | 07:35PM", "Crusaders V Hurricanes", "One NZ Stadium")
      + row("4", "Sat 6 Mar | 07:05PM", "Crusaders V Chiefs", "One NZ Stadium, Christchurch")
      + row("3", "Sun 28 Feb | 04:00 PM", "Blues V Crusaders", "Eden Park")
      + row("5", "Fri 12 Mar | 07:35PM", "Away fixture", "One NZ Stadium, Auckland")
      + row("11", "|", "CRUSADERS V BYE", ""),
    ), crusadersUrl).events;
    expect(events).toHaveLength(3);
    expect(events?.[0]).toMatchObject({
      externalId: "crusaders:1:2027-02-12T06:35:00.000Z",
      title: "Crusaders V Reds", venueName: "One New Zealand Stadium", city: "Christchurch",
      startsAt: new Date("2027-02-12T06:35:00Z"),
    });
    const legacy = parseChristchurchSports(draw(row("1", "Fri 12 Feb | 07:35 PM", "Crusaders V Reds", "One NZ Stadium, Christchurch")), crusadersUrl);
    expect(legacy.events?.[0]?.externalId).toBe(events?.[0]?.externalId);
  });

  it("accepts a recognized draw containing only dated away fixtures", async () => {
    mockPages({ [crusadersUrl]: draw(row("3", "Sun 28 Feb | 04:00 PM", "Blues V Crusaders", "Eden Park")) });
    await expect(publicDataAdapters.christchurch_sports!.fetch(crusadersUrl, context)).resolves.toEqual([]);
  });

  it("continues across out-of-window rugby and netball to the two in-window cricket fixtures", async () => {
    const references = await publicDataAdapters.christchurch_sports!.discover({ marketScope: "new-zealand", ...context.collectionRange }, context);
    const cricket = (name: string, date: string) => ({
      "@context": "https://schema.org", "@type": "SportsEvent", name, startDate: date,
      location: { "@type": "Place", name: "Hagley Oval", address: { addressLocality: "Christchurch" } },
    });
    const fetch = mockPages({
      [references[0]!]: draw(row("1", "Fri 12 Feb | 07:35 PM", "Crusaders V Reds", "One New Zealand Stadium")),
      [references[1]!]: '<h1>2026 Draw</h1><div class="match home-game"><div class="date"><div class="additional">Round 6</div><div class="day">16</div><div class="month">May</div></div><div class="details"><div class="location">Parakiore Recreation and Sports Centre Christchurch</div></div></div>',
      [references[2]!]: '<script type="application/ld+json">' + JSON.stringify([
        cricket("Canterbury Kings vs Northern Brave (M)", "2026-11-12T00:00:00+00:00"),
        cricket("Canterbury vs Wellington", "2026-12-15T00:00:00+00:00"),
      ]) + "</script>",
    });
    const records = [];
    for (const reference of references) records.push(...await publicDataAdapters.christchurch_sports!.fetch(reference, context));
    const events = await publicDataAdapters.christchurch_sports!.normaliseEvents!(records, context);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(events.map((event) => event.title)).toEqual(["Canterbury Kings vs Northern Brave (M)", "Canterbury vs Wellington"]);
    expect(events.every((event) => event.fixture === false && event.venueName === "Hagley Oval")).toBe(true);
  });

  it.each([
    "<h1>Verify you are human</h1>",
    draw(""),
    draw(row("1", "Fri 12 Feb | 07:35 PM", "Crusaders V Reds", "One New Zealand Stadium"), ""),
    draw(row("1", "Date format changed", "Crusaders V Reds", "One New Zealand Stadium")
      + row("3", "Sun 28 Feb | 04:00 PM", "Blues V Crusaders", "Eden Park")),
  ])("keeps unrecognized or broken fixture pages as parser failures", async (html) => {
    mockPages({ [crusadersUrl]: html });
    await expect(publicDataAdapters.christchurch_sports!.fetch(crusadersUrl, context))
      .rejects.toMatchObject({ code: "PARSING_ERROR", retryable: false });
  });

  it("retains HTTP failure handling even when the response body resembles a valid empty draw", async () => {
    mockPages({ [crusadersUrl]: draw(row("3", "Sun 28 Feb | 04:00 PM", "Blues V Crusaders", "Eden Park")) }, 503);
    await expect(publicDataAdapters.christchurch_sports!.fetch(crusadersUrl, context)).rejects.toMatchObject({ retryable: true });
  });
});

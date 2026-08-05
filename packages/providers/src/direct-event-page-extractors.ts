import { parseHTML } from "linkedom";

const EVENTFINDA_HOSTS = new Set(["eventfinda.co.nz", "www.eventfinda.co.nz"]);
const TICKETMASTER_HOSTS = new Set(["ticketmaster.co.nz", "www.ticketmaster.co.nz"]);

type JsonRecord = Record<string, unknown>;

export function extractEventfindaHttpPage(input: { html: string; title: string; finalUrl: string }) {
  const url = new URL(input.finalUrl);
  if (!EVENTFINDA_HOSTS.has(url.hostname.toLowerCase())) throw new Error(`Unsupported Eventfinda host: ${url.hostname}`);
  const { document } = parseHTML(input.html);
  if (url.pathname.startsWith("/whatson/events/")) {
    const events = [...document.querySelectorAll(".listings-events .card.h-event")].flatMap((card) => {
      const link = card.querySelector(".p-name a[href]") ?? card.querySelector("a.card-image[href]");
      const sourceUrl = absoluteUrl(link?.getAttribute("href"), url);
      const eventTitle = text(card.querySelector(".p-name"));
      if (!sourceUrl || !eventTitle) return [];
      return [{
        eventId: matchEventId(card.innerHTML),
        title: eventTitle,
        sourceUrl,
        startsAt: card.querySelector(".dtstart .value-title")?.getAttribute("title") ?? null,
        venueName: text(card.querySelector(".p-location a.location")) || null,
        location: text(card.querySelector(".p-location")) || null,
        category: text(card.querySelector(".meta-date .category")) || null,
        imageUrl: absoluteUrl(card.querySelector("img")?.getAttribute("data-src") ?? card.querySelector("img")?.getAttribute("src"), url),
        sponsored: card.classList.contains("sponsored") || Boolean(card.querySelector(".sponsored")),
        ticketAction: text(card.querySelector(".buy-tickets, .btn-ticket, [class*='ticket']")) || null,
      }];
    });
    const pages = [...document.querySelectorAll(".pagination a[href]")]
      .map((anchor) => pageNumber(anchor.getAttribute("href")))
      .filter((value): value is number => value !== null);
    const currentPage = pageNumber(url.pathname) ?? 1;
    return {
      extractor: "eventfinda" as const,
      kind: "listing" as const,
      title: input.title,
      canonicalUrl: canonicalUrl(url, "www.eventfinda.co.nz"),
      currentPage,
      totalPages: pages.length ? Math.max(currentPage, ...pages) : currentPage,
      nextUrl: absoluteUrl(document.querySelector(".pagination .next a[href]")?.getAttribute("href"), url),
      events,
    };
  }

  const items = jsonLdItems(document);
  const events = items.filter(isEvent);
  const places = items.filter((item) => hasType(item, "Place"));
  const offers = items.filter((item) => hasType(item, "Offer"));
  const entities = items.filter((item) => ["Person", "PerformingGroup", "MusicGroup", "Organization"].some((type) => hasType(item, type)));
  const byId = new Map(items.flatMap((item) => typeof item["@id"] === "string" ? [[item["@id"], item] as const] : []));
  const pagePlace = places[0] ?? null;
  const pageDescription = text(document.querySelector("#eventDescription")) || null;
  const occurrences = events.flatMap((event) => {
    const startDate = stringValue(event.startDate);
    if (!startDate) return [];
    const location = resolveRecord(event.location, byId) ?? pagePlace;
    return [{
      name: stringValue(event.name) ?? text(document.querySelector("h1.p-name")) ?? input.title,
      description: cleanText(stringValue(event.description)) ?? pageDescription,
      sourceUrl: canonicalUrl(new URL(stringValue(event.url) ?? url.href), "www.eventfinda.co.nz"),
      startDate,
      endDate: stringValue(event.endDate),
      previousStartDate: stringValue(event.previousStartDate),
      eventStatus: schemaName(event.eventStatus),
      attendanceMode: schemaName(event.eventAttendanceMode),
      imageUrls: stringList(event.image),
      location: normalisePlace(location),
      offers: asArray(event.offers).map((value) => normaliseOffer(resolveRecord(value, byId) ?? value)).filter(isPresent),
      performers: asArray(event.performer).map((value) => normaliseEntity(resolveRecord(value, byId) ?? value)).filter(isPresent),
      organizer: normaliseEntity(resolveRecord(event.organizer, byId) ?? event.organizer),
    }];
  });
  if (!occurrences.length) throw new Error("Eventfinda detail page contains no supported event JSON-LD");
  const moduleLinks = (selector: string) => [...document.querySelectorAll(`${selector} a[href]`)].flatMap((anchor) => {
    const link = absoluteUrl(anchor.getAttribute("href"), url);
    return link ? [{ label: text(anchor), url: link }] : [];
  });
  return {
    extractor: "eventfinda" as const,
    kind: "event_detail" as const,
    eventId: document.querySelector("[data-watchable-type='event'][data-watchable-id]")?.getAttribute("data-watchable-id") ?? matchEventId(input.html),
    title: text(document.querySelector("h1.p-name")) || occurrences[0]!.name,
    canonicalUrl: canonicalUrl(url, "www.eventfinda.co.nz"),
    category: text(document.querySelector(".p-category, a.category")) || null,
    description: pageDescription ?? occurrences[0]!.description,
    imageUrls: unique([...occurrences.flatMap((event) => event.imageUrls), ...[...document.querySelectorAll(".container-listing-superfeature img")].flatMap((image) => [image.getAttribute("src"), ...(image.getAttribute("srcset") ?? "").split(",").map((part) => part.trim().split(/\s+/)[0])])].flatMap((value) => absoluteUrl(value, url) ?? [])),
    venue: normalisePlace(pagePlace) ?? occurrences[0]!.location,
    offers: uniqueObjects([...offers.map(normaliseOffer).filter(isPresent), ...occurrences.flatMap((event) => event.offers)]),
    performers: uniqueObjects([...entities.map(normaliseEntity).filter(isPresent), ...occurrences.flatMap((event) => event.performers)]),
    occurrences,
    restrictions: text(document.querySelector(".module.restrictions")) || null,
    phoneSales: text(document.querySelector(".module.phone-sales")) || null,
    websites: moduleLinks(".module.websites"),
    listedBy: moduleLinks(".module.promoter"),
    tour: moduleLinks(".module.tour"),
  };
}

export function extractTicketmasterHttpPage(input: { html: string; title: string; finalUrl: string }) {
  const url = new URL(input.finalUrl);
  if (!TICKETMASTER_HOSTS.has(url.hostname.toLowerCase())) throw new Error(`Unsupported Ticketmaster host: ${url.hostname}`);
  const { document } = parseHTML(input.html);
  const items: JsonRecord[] = [];
  const nextData = document.querySelector("#__NEXT_DATA__")?.textContent;
  if (nextData) flattenJsonLd((JSON.parse(nextData) as JsonRecord)?.props, items, true);
  for (const item of jsonLdItems(document)) items.push(item);
  const events = uniqueObjects(items.filter(isEvent).flatMap((event) => normaliseTicketmasterEvent(event))).filter((event) => Boolean(event.eventId));
  if (!events.length) throw new Error("Ticketmaster page contains no supported event JSON-LD");
  return {
    extractor: "ticketmaster" as const,
    kind: /\/event\/[^/]+\/?$/i.test(url.pathname) ? "event_detail" as const : "listing" as const,
    title: input.title,
    canonicalUrl: canonicalUrl(url, "www.ticketmaster.co.nz"),
    events,
  };
}

function normaliseTicketmasterEvent(value: JsonRecord): JsonRecord[] {
  const sourceUrl = stringValue(value.url);
  if (!sourceUrl) return [];
  let source: URL;
  try { source = new URL(sourceUrl); } catch { return []; }
  if (!TICKETMASTER_HOSTS.has(source.hostname.toLowerCase())) return [];
  const eventId = source.pathname.match(/\/event\/([^/?#]+)/i)?.[1];
  const title = stringValue(value.name);
  const startsAt = stringValue(value.startDate);
  if (!eventId || !title || !startsAt) return [];
  const location = recordValue(value.location);
  const address = recordValue(location.address);
  const geo = recordValue(location.geo);
  return [compact({
    eventId, title, sourceUrl: canonicalUrl(source, "www.ticketmaster.co.nz"),
    description: stringValue(value.description), category: schemaName(value["@type"]), startsAt,
    endsAt: stringValue(value.endDate), eventStatus: schemaName(value.eventStatus), attendanceMode: schemaName(value.eventAttendanceMode),
    venue: compact({ name: stringValue(location.name), sourceUrl: stringValue(location.sameAs), address: compact({ streetAddress: stringValue(address.streetAddress), addressLocality: stringValue(address.addressLocality), addressRegion: stringValue(address.addressRegion), postalCode: stringValue(address.postalCode), addressCountry: countryName(address.addressCountry) }), latitude: numberValue(geo.latitude), longitude: numberValue(geo.longitude) }),
    offers: asArray(value.offers).map(normaliseOffer).filter(isPresent),
    performers: asArray(value.performer).map(normaliseEntity).filter(isPresent),
    imageUrls: stringList(value.image),
  })];
}

function jsonLdItems(document: Document): JsonRecord[] {
  const output: JsonRecord[] = [];
  for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
    try { flattenJsonLd(JSON.parse(script.textContent), output); } catch { /* Ignore unrelated malformed blocks. */ }
  }
  return output;
}

function flattenJsonLd(value: unknown, output: JsonRecord[], searchNested = false): void {
  if (Array.isArray(value)) { value.forEach((item) => flattenJsonLd(item, output, searchNested)); return; }
  if (!isRecord(value)) return;
  if (Array.isArray(value["@graph"])) flattenJsonLd(value["@graph"], output, searchNested);
  if (value["@type"]) output.push(value);
  if (searchNested) Object.values(value).forEach((item) => flattenJsonLd(item, output, true));
}

function normalisePlace(value: unknown) {
  if (!isRecord(value)) return null;
  const address = recordValue(value.address);
  const geo = recordValue(value.geo);
  return compact({ id: stringValue(value["@id"]), name: stringValue(value.name), url: stringValue(value.url), address: compact({ streetAddress: stringValue(address.streetAddress), addressLocality: stringValue(address.addressLocality), addressRegion: stringValue(address.addressRegion), postalCode: stringValue(address.postalCode), addressCountry: countryName(address.addressCountry) }), latitude: numberValue(geo.latitude), longitude: numberValue(geo.longitude) });
}

function normaliseOffer(value: unknown) {
  if (!isRecord(value)) return null;
  return compact({ id: stringValue(value["@id"]), name: stringValue(value.name), price: stringValue(value.price) ?? numberValue(value.price), lowPrice: stringValue(value.lowPrice) ?? numberValue(value.lowPrice), highPrice: stringValue(value.highPrice) ?? numberValue(value.highPrice), priceCurrency: stringValue(value.priceCurrency) ?? "NZD", availability: schemaName(value.availability), validFrom: stringValue(value.validFrom), url: stringValue(value.url) });
}

function normaliseEntity(value: unknown) {
  if (!isRecord(value)) return null;
  const name = stringValue(value.name);
  return name ? compact({ id: stringValue(value["@id"]), type: schemaName(value["@type"]), name, url: stringValue(value.url) }) : null;
}

function resolveRecord(value: unknown, byId: Map<string, JsonRecord>) {
  if (typeof value === "string") return byId.get(value) ?? null;
  if (!isRecord(value)) return null;
  return typeof value["@id"] === "string" ? byId.get(value["@id"]) ?? value : value;
}

function hasType(value: JsonRecord, type: string) { return asArray(value["@type"]).some((item) => schemaName(item) === type); }
function isEvent(value: JsonRecord) {
  return Boolean(stringValue(value.startDate)) && asArray(value["@type"]).some((item) => {
    const type = schemaName(item);
    return type === "Festival" || type === "Hackathon" || type === "CourseInstance" || Boolean(type?.endsWith("Event"));
  });
}
function asArray(value: unknown): unknown[] { return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]; }
function recordValue(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function isPresent<T>(value: T | null): value is T { return value !== null; }
function stringValue(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function numberValue(value: unknown) { const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN; return Number.isFinite(parsed) ? parsed : null; }
function schemaName(value: unknown) { const result = stringValue(value); return result ? result.split(/[\/#]/).pop() ?? null : null; }
function countryName(value: unknown) { return isRecord(value) ? stringValue(value.name) ?? stringValue(value["@id"]) : stringValue(value); }
function stringList(value: unknown) { return unique(asArray(value).flatMap((item) => typeof item === "string" ? [item] : isRecord(item) && typeof item.url === "string" ? [item.url] : [])); }
function text(element: Element | null | undefined) { return (element?.textContent ?? "").replace(/\s+/g, " ").trim(); }
function cleanText(value: string | null) { if (!value) return null; const { document } = parseHTML(`<body>${value}</body>`); return text(document.body) || null; }
function compact(value: JsonRecord): JsonRecord { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== "" && !(isRecord(item) && Object.keys(item).length === 0))); }
function unique<T>(values: T[]) { return [...new Set(values)]; }
function uniqueObjects<T>(values: T[]) { const seen = new Set<string>(); return values.filter((value) => { const key = JSON.stringify(value); if (seen.has(key)) return false; seen.add(key); return true; }); }
function matchEventId(html: string) { return html.match(/_efC\(\s*3\s*,\s*(\d+)\s*\)/)?.[1] ?? null; }
function pageNumber(path: string | null | undefined) { const match = String(path ?? "").match(/\/page\/(\d+)/); return match ? Number(match[1]) : null; }
function absoluteUrl(value: string | null | undefined, base: URL) { if (!value || /^(?:javascript|data):/i.test(value)) return null; try { return new URL(value, base).href; } catch { return null; } }
function canonicalUrl(value: URL, hostname: string) { const url = new URL(value); url.protocol = "https:"; url.hostname = hostname; url.search = ""; url.hash = ""; return url.href.replace(/\/$/, ""); }

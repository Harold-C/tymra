import { parseHTML } from "linkedom";

const TICKETMASTER_HOSTS = new Set(["ticketmaster.co.nz", "www.ticketmaster.co.nz"]);

export function extractTicketmasterPage({ html, title, finalUrl }) {
  const url = new URL(finalUrl);
  if (!TICKETMASTER_HOSTS.has(url.hostname.toLowerCase())) throw new Error(`Unsupported Ticketmaster host: ${url.hostname}`);
  const { document } = parseHTML(html);
  const items = [];
  const nextData = document.querySelector("#__NEXT_DATA__")?.textContent;
  if (nextData) {
    try { flatten(JSON.parse(nextData)?.props?.pageProps?.eventsJsonLD, items); }
    catch { throw new Error("Ticketmaster __NEXT_DATA__ is not valid JSON"); }
  }
  for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
    try { flatten(JSON.parse(script.textContent), items); } catch {}
  }
  const events = uniqueBy(items.filter(isEvent).map(normaliseEvent).filter(Boolean), (event) => event.eventId);
  if (!events.length) throw new Error("Ticketmaster page contains no supported event JSON-LD");
  return {
    extractor: "ticketmaster",
    kind: /\/event\/[^/]+\/?$/i.test(url.pathname) ? "event_detail" : "listing",
    title,
    canonicalUrl: canonicalUrl(url),
    events,
  };
}

function normaliseEvent(value) {
  const sourceUrl = urlValue(value.url);
  if (!sourceUrl || !TICKETMASTER_HOSTS.has(new URL(sourceUrl).hostname.toLowerCase())) return null;
  const eventId = new URL(sourceUrl).pathname.match(/\/event\/([^/?#]+)/i)?.[1] ?? null;
  const name = stringValue(value.name);
  const startsAt = stringValue(value.startDate);
  if (!eventId || !name || !startsAt) return null;
  const location = value.location && typeof value.location === "object" ? value.location : {};
  const address = location.address && typeof location.address === "object" ? location.address : {};
  const geo = location.geo && typeof location.geo === "object" ? location.geo : {};
  return compact({
    eventId,
    title: name,
    sourceUrl: canonicalUrl(new URL(sourceUrl)),
    description: stringValue(value.description),
    category: schemaName(value["@type"]),
    startsAt,
    endsAt: stringValue(value.endDate),
    eventStatus: schemaName(value.eventStatus),
    attendanceMode: schemaName(value.eventAttendanceMode),
    venue: compact({
      name: stringValue(location.name),
      sourceUrl: urlValue(location.sameAs),
      address: compact({
        streetAddress: stringValue(address.streetAddress),
        addressLocality: stringValue(address.addressLocality),
        addressRegion: stringValue(address.addressRegion),
        postalCode: stringValue(address.postalCode),
        addressCountry: countryName(address.addressCountry),
      }),
      latitude: numberValue(geo.latitude),
      longitude: numberValue(geo.longitude),
    }),
    offers: asArray(value.offers).map(normaliseOffer).filter(Boolean),
    performers: asArray(value.performer).map(normaliseEntity).filter(Boolean),
    imageUrls: asArray(value.image).flatMap((image) => typeof image === "string" ? [image] : typeof image?.url === "string" ? [image.url] : []),
  });
}

function normaliseOffer(value) {
  if (!value || typeof value !== "object") return null;
  return compact({ availability: schemaName(value.availability), url: urlValue(value.url), price: stringValue(value.price) ?? numberValue(value.price), priceCurrency: stringValue(value.priceCurrency) });
}

function normaliseEntity(value) {
  if (!value || typeof value !== "object") return null;
  const name = stringValue(value.name);
  return name ? compact({ name, type: schemaName(value["@type"]), url: urlValue(value.url) }) : null;
}

function flatten(value, output) {
  if (Array.isArray(value)) return value.forEach((item) => flatten(item, output));
  if (!value || typeof value !== "object") return;
  if (value["@graph"]) flatten(value["@graph"], output);
  if (value["@type"]) output.push(value);
}

function isEvent(value) { return asArray(value?.["@type"]).some((item) => schemaName(item)?.endsWith("Event")); }
function asArray(value) { return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]; }
function stringValue(value) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function numberValue(value) { const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN; return Number.isFinite(parsed) ? parsed : null; }
function schemaName(value) { const result = stringValue(value); return result ? result.split(/[\/#]/).pop() : null; }
function countryName(value) { return typeof value === "object" && value ? stringValue(value.name) ?? stringValue(value["@id"]) : stringValue(value); }
function urlValue(value) { const result = stringValue(value); if (!result) return null; try { return new URL(result).href; } catch { return null; } }
function canonicalUrl(value) { const url = new URL(value); url.protocol = "https:"; url.hostname = "www.ticketmaster.co.nz"; url.search = ""; url.hash = ""; return url.href.replace(/\/$/, ""); }
function compact(value) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== "" && !(typeof item === "object" && !Array.isArray(item) && Object.keys(item).length === 0))); }
function uniqueBy(values, key) { const seen = new Set(); return values.filter((value) => { const id = key(value); if (seen.has(id)) return false; seen.add(id); return true; }); }

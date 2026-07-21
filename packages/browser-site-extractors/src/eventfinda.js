import { parseHTML } from "linkedom";

const EVENTFINDA_HOSTS = new Set(["eventfinda.co.nz", "www.eventfinda.co.nz"]);

export function extractEventfindaPage({ html, title, finalUrl }) {
  const url = new URL(finalUrl);
  if (!EVENTFINDA_HOSTS.has(url.hostname.toLowerCase())) throw new Error(`Unsupported Eventfinda host: ${url.hostname}`);
  const { document } = parseHTML(html);
  if (url.pathname.startsWith("/whatson/events/")) return extractListing(document, url, title);
  return extractDetail(document, url, title, html);
}

function extractListing(document, url, title) {
  const cards = [...document.querySelectorAll(".listings-events .card.h-event")];
  const events = cards.map((card) => {
    const link = card.querySelector(".p-name a[href]") ?? card.querySelector("a.card-image[href]");
    const sourceUrl = absoluteUrl(link?.getAttribute("href"), url);
    const eventId = matchEventId(card.innerHTML);
    return {
      eventId,
      title: text(card.querySelector(".p-name")),
      sourceUrl,
      startsAt: card.querySelector(".dtstart .value-title")?.getAttribute("title") ?? null,
      venueName: text(card.querySelector(".p-location a.location")) || null,
      location: text(card.querySelector(".p-location")) || null,
      category: text(card.querySelector(".meta-date .category")) || null,
      imageUrl: absoluteUrl(card.querySelector("img")?.getAttribute("data-src") ?? card.querySelector("img")?.getAttribute("src"), url),
      sponsored: card.classList.contains("sponsored") || Boolean(card.querySelector(".sponsored")),
      ticketAction: text(card.querySelector(".buy-tickets, .btn-ticket, [class*='ticket']")) || null,
    };
  }).filter((event) => event.title && event.sourceUrl);

  const pages = [...document.querySelectorAll(".pagination a[href]")]
    .map((anchor) => pageNumber(anchor.getAttribute("href")))
    .filter((value) => value !== null);
  const currentPage = pageNumber(url.pathname) ?? 1;
  const totalPages = pages.length ? Math.max(currentPage, ...pages) : currentPage;
  const nextHref = document.querySelector(".pagination .next a[href]")?.getAttribute("href");
  return {
    extractor: "eventfinda",
    kind: "listing",
    title,
    canonicalUrl: canonicalEventfindaUrl(url),
    currentPage,
    totalPages,
    nextUrl: absoluteUrl(nextHref, url),
    events,
  };
}

function extractDetail(document, url, title, html) {
  const jsonLd = jsonLdItems(document);
  const places = jsonLd.filter((item) => hasType(item, "Place"));
  const offers = jsonLd.filter((item) => hasType(item, "Offer"));
  const performers = jsonLd.filter((item) => hasAnyType(item, ["Person", "PerformingGroup", "MusicGroup", "Organization"]));
  const events = jsonLd.filter(isEventItem);
  const placeById = new Map(places.filter((item) => item["@id"]).map((item) => [item["@id"], item]));
  const offerById = new Map(offers.filter((item) => item["@id"]).map((item) => [item["@id"], item]));
  const performerById = new Map(performers.filter((item) => item["@id"]).map((item) => [item["@id"], item]));
  const eventId = document.querySelector("[data-watchable-type='event'][data-watchable-id]")?.getAttribute("data-watchable-id") ?? matchEventId(html);
  const pagePlace = places[0] ?? null;
  const pageDescription = text(document.querySelector("#eventDescription")) || null;
  const category = text(document.querySelector(".p-category, a.category")) || null;

  const occurrences = events.map((event) => {
    const location = resolveReference(event.location, placeById) ?? pagePlace;
    return {
      name: stringValue(event.name) ?? text(document.querySelector("h1.p-name")) ?? title,
      description: cleanText(stringValue(event.description)) ?? pageDescription,
      sourceUrl: canonicalEventfindaUrl(new URL(stringValue(event.url) ?? url.href)),
      startDate: stringValue(event.startDate),
      endDate: stringValue(event.endDate),
      previousStartDate: stringValue(event.previousStartDate),
      eventStatus: schemaName(event.eventStatus),
      attendanceMode: schemaName(event.eventAttendanceMode),
      imageUrls: stringList(event.image),
      location: normalisePlace(location),
      offers: normaliseOffers(event.offers, offerById),
      performers: normaliseEntities(event.performer, performerById),
      organizer: normaliseEntity(resolveReference(event.organizer, performerById) ?? event.organizer),
    };
  }).filter((event) => event.startDate && event.sourceUrl);

  const modules = extractModules(document, url);
  return {
    extractor: "eventfinda",
    kind: "event_detail",
    eventId,
    title: text(document.querySelector("h1.p-name")) || occurrences[0]?.name || title,
    canonicalUrl: canonicalEventfindaUrl(url),
    category,
    description: pageDescription ?? occurrences[0]?.description ?? null,
    imageUrls: unique([
      ...occurrences.flatMap((event) => event.imageUrls),
      ...[...document.querySelectorAll(".container-listing-superfeature img")].flatMap((image) => [image.getAttribute("src"), ...(image.getAttribute("srcset") ?? "").split(",").map((item) => item.trim().split(/\s+/)[0])]),
    ].map((value) => absoluteUrl(value, url)).filter(Boolean)),
    venue: normalisePlace(pagePlace) ?? occurrences[0]?.location ?? null,
    offers: uniqueObjects([...offers.map((offer) => normaliseOffer(offer)), ...occurrences.flatMap((event) => event.offers)]),
    performers: uniqueObjects([...performers.map((performer) => normaliseEntity(performer)), ...occurrences.flatMap((event) => event.performers)]),
    occurrences,
    restrictions: modules.restrictions,
    phoneSales: modules.phoneSales,
    websites: modules.websites,
    listedBy: modules.listedBy,
    tour: modules.tour,
  };
}

function jsonLdItems(document) {
  const output = [];
  for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
    try { flattenJsonLd(JSON.parse(script.textContent), output); } catch {}
  }
  return output;
}

function flattenJsonLd(value, output) {
  if (Array.isArray(value)) return value.forEach((item) => flattenJsonLd(item, output));
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value["@graph"])) flattenJsonLd(value["@graph"], output);
  if (value["@type"]) output.push(value);
}

function extractModules(document, baseUrl) {
  const moduleText = (selector) => text(document.querySelector(selector)) || null;
  const links = (selector) => [...document.querySelectorAll(`${selector} a[href]`)].map((anchor) => ({ label: text(anchor), url: absoluteUrl(anchor.getAttribute("href"), baseUrl) })).filter((item) => item.url);
  return {
    restrictions: moduleText(".module.restrictions"),
    phoneSales: moduleText(".module.phone-sales"),
    websites: links(".module.websites"),
    listedBy: links(".module.promoter"),
    tour: links(".module.tour"),
  };
}

function normalisePlace(place) {
  if (!place || typeof place !== "object") return null;
  const address = place.address && typeof place.address === "object" ? place.address : {};
  const geo = place.geo && typeof place.geo === "object" ? place.geo : {};
  return compact({
    id: stringValue(place["@id"]),
    name: stringValue(place.name),
    url: stringValue(place.url) ?? (typeof place["@id"] === "string" && place["@id"].startsWith("http") ? place["@id"] : null),
    address: compact({
      streetAddress: stringValue(address.streetAddress),
      addressLocality: stringValue(address.addressLocality),
      addressRegion: stringValue(address.addressRegion),
      postalCode: stringValue(address.postalCode),
      addressCountry: countryName(address.addressCountry),
    }),
    latitude: numberValue(geo.latitude),
    longitude: numberValue(geo.longitude),
  });
}

function normaliseOffers(value, byId) {
  return asArray(value).map((offer) => resolveReference(offer, byId) ?? offer).map(normaliseOffer).filter(Boolean);
}

function normaliseOffer(offer) {
  if (!offer || typeof offer !== "object") return null;
  return compact({
    id: stringValue(offer["@id"]),
    name: stringValue(offer.name),
    price: stringValue(offer.price) ?? numberValue(offer.price),
    lowPrice: stringValue(offer.lowPrice) ?? numberValue(offer.lowPrice),
    highPrice: stringValue(offer.highPrice) ?? numberValue(offer.highPrice),
    priceCurrency: stringValue(offer.priceCurrency) ?? "NZD",
    availability: schemaName(offer.availability),
    validFrom: stringValue(offer.validFrom),
    url: stringValue(offer.url),
  });
}

function normaliseEntities(value, byId) {
  return asArray(value).map((entity) => resolveReference(entity, byId) ?? entity).map(normaliseEntity).filter(Boolean);
}

function normaliseEntity(entity) {
  if (!entity || typeof entity !== "object") return null;
  const name = stringValue(entity.name);
  if (!name || /^(?:n\/?a|not applicable|unknown)$/i.test(name)) return null;
  return compact({ id: stringValue(entity["@id"]), type: schemaName(entity["@type"]), name, url: stringValue(entity.url) });
}

function resolveReference(value, byId) {
  if (typeof value === "string") return byId.get(value) ?? null;
  if (value && typeof value === "object" && typeof value["@id"] === "string") return byId.get(value["@id"]) ?? value;
  return value && typeof value === "object" ? value : null;
}

function hasType(item, type) { return asArray(item?.["@type"]).some((value) => schemaName(value) === type); }
function hasAnyType(item, types) { return types.some((type) => hasType(item, type)); }
function isEventItem(item) {
  if (!stringValue(item?.startDate)) return false;
  return asArray(item?.["@type"]).some((value) => {
    const type = schemaName(value);
    return type === "Festival" || type === "Hackathon" || type === "CourseInstance" || type?.endsWith("Event");
  });
}
function asArray(value) { return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]; }
function stringList(value) { return unique(asArray(value).flatMap((item) => typeof item === "string" ? [item] : item && typeof item === "object" && typeof item.url === "string" ? [item.url] : [])); }
function stringValue(value) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function numberValue(value) { const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN; return Number.isFinite(parsed) ? parsed : null; }
function schemaName(value) { const string = stringValue(value); return string ? string.split(/[\/#]/).pop() : null; }
function countryName(value) { return typeof value === "object" && value ? stringValue(value.name) ?? stringValue(value["@id"]) : stringValue(value); }
function cleanText(value) { if (!value) return null; const { document } = parseHTML(`<body>${value}</body>`); return text(document.body) || null; }
function text(element) { return (element?.innerText ?? element?.textContent ?? "").replace(/\s+/g, " ").trim(); }
function compact(value) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== "" && !(typeof item === "object" && !Array.isArray(item) && Object.keys(item).length === 0))); }
function unique(values) { return [...new Set(values)]; }
function uniqueObjects(values) { const seen = new Set(); return values.filter(Boolean).filter((value) => { const key = JSON.stringify(value); if (seen.has(key)) return false; seen.add(key); return true; }); }
function matchEventId(html) { return html.match(/_efC\(\s*3\s*,\s*(\d+)\s*\)/)?.[1] ?? null; }
function pageNumber(path) { const match = String(path ?? "").match(/\/page\/(\d+)/); return match ? Number(match[1]) : null; }
function absoluteUrl(value, base) { if (!value || /^(?:javascript|data):/i.test(value)) return null; try { return new URL(value, base).href; } catch { return null; } }
function canonicalEventfindaUrl(value) { const url = new URL(value); url.protocol = "https:"; url.hostname = "www.eventfinda.co.nz"; url.search = ""; url.hash = ""; return url.href.replace(/\/$/, ""); }

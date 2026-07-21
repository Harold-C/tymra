import { parseHTML } from "linkedom";

const RBNZ_HOSTS = new Set(["rbnz.govt.nz", "www.rbnz.govt.nz"]);
const SERIES_CODES = new Map([
  ["17 currency basket", "TWI"],
  ["United States dollar", "USD"],
  ["UK pound sterling", "GBP"],
  ["Australian dollar", "AUD"],
  ["Japanese yen", "JPY"],
  ["European euro", "EUR"],
  ["Chinese renminbi", "CNY"],
]);

export function extractRbnzFxPage({ html, title, finalUrl }) {
  const url = new URL(finalUrl);
  if (!RBNZ_HOSTS.has(url.hostname.toLowerCase())) throw new Error(`Unsupported RBNZ host: ${url.hostname}`);
  const { document } = parseHTML(html);
  const table = [...document.querySelectorAll("table.table--data")].find((candidate) => {
    const body = text(candidate);
    return body.includes("17 currency basket") && body.includes("United States dollar");
  });
  if (!table) throw new Error("RBNZ B1 page contains no supported exchange-rate table");
  const headers = [...table.querySelectorAll("thead th")].map((cell) => text(cell));
  const datedHeaders = headers.map((value, index) => ({ date: parseRbnzDate(value), index })).filter((item) => item.date);
  const latest = datedHeaders.at(-1);
  const previous = datedHeaders.at(-2);
  if (!latest) throw new Error("RBNZ B1 table contains no dated columns");
  const rates = [...table.querySelectorAll("tbody tr")].flatMap((row) => {
    const cells = [...row.querySelectorAll("td")].map((cell) => text(cell));
    const series = SERIES_CODES.get(cells[0]);
    const value = numberValue(cells[latest.index]);
    if (!series || value === null) return [];
    return [{
      series,
      label: cells[0],
      value,
      previousValue: previous ? numberValue(cells[previous.index]) : null,
    }];
  });
  if (!rates.length) throw new Error("RBNZ B1 table contains no supported rate values");
  return {
    extractor: "rbnz_fx",
    kind: "exchange_rates",
    title,
    canonicalUrl: canonicalUrl(url),
    asOf: latest.date,
    previousAsOf: previous?.date ?? null,
    baseCurrency: "NZD",
    quoteConvention: "foreign_currency_units_per_NZD",
    rates,
  };
}

function parseRbnzDate(value) {
  const match = value.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(20\d{2})$/);
  if (!match) return null;
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(match[2]);
  if (month < 0) return null;
  const date = new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonicalUrl(value) {
  const url = new URL(value);
  url.protocol = "https:";
  url.hostname = "www.rbnz.govt.nz";
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

function text(element) { return element?.textContent?.replace(/\s+/g, " ").trim() ?? ""; }

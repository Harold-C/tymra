import type { AdapterContext, AdapterHealth, AdapterMetadata, PublicDataAdapter, PublicRawRecord, PublicSignal } from "../adapter-types";
import { AdapterError } from "../adapter-types";

export const RBNZ_B1_URL = "https://www.rbnz.govt.nz/statistics/series/exchange-and-interest-rates/exchange-rates-and-the-trade-weighted-index";

export class RbnzFxBrowserAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = {
    sourceId: "fx_rates",
    sourceName: "Reserve Bank of New Zealand B1 exchange rates",
    sourceType: "PUBLIC_DATA",
    supportedDomains: ["www.rbnz.govt.nz", "rbnz.govt.nz"],
    adapterKey: "public:fx_rates:rbnz-browser-v1",
    accessMethod: "OFFICIAL_PUBLIC_HTML_BROWSER",
    concurrencyLimit: 1,
    dailyBudget: 4,
    collectorVersion: "rbnz-browser-fetch-v1",
    parserVersion: "rbnz-b1-table-v1",
  };

  async discover(): Promise<string[]> {
    throw new AdapterError("CONFIGURATION_ERROR", "RBNZ B1 collection is orchestrated by Argus", false);
  }

  async fetch(): Promise<PublicRawRecord[]> {
    throw new AdapterError("CONFIGURATION_ERROR", "RBNZ B1 collection is orchestrated by Argus", false);
  }

  async normalise(): Promise<PublicSignal[]> { return []; }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try {
      const response = await fetch(RBNZ_B1_URL, { headers: { accept: "text/html" }, signal: context.signal ?? AbortSignal.timeout(10_000) });
      return { status: response.ok || response.status === 403 ? "DEGRADED" : "DOWN", checkedAt: new Date(), message: `RBNZ public web returned HTTP ${response.status}; browser collection is required`, latencyMs: Date.now() - started, mode: context.mode };
    } catch (error) {
      return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : "RBNZ public web health check failed", latencyMs: Date.now() - started, mode: context.mode };
    }
  }

}

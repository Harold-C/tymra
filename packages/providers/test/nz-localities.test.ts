import { describe, expect, it, vi } from "vitest";
import { LinzLocalitiesProvider } from "../src/nz-localities";
const attributes = { id: 1394, name: "Riccarton", major_name: "Christchurch", territorial_authority: "Christchurch City" };
describe("LINZ localities", () => {
  it("groups city authorities by region and keeps towns and parks out of the city level", async () => {
    const fetcher = vi.fn(async () => Response.json({ features: [
      { attributes: { ...attributes, major_name_type: "City" } },
      { attributes: { ...attributes, major_name_type: "City", territorial_authority: "Christchurch City, Selwyn District" } },
      { attributes: { major_name: "Ashburton", major_name_type: "Town", territorial_authority: "Ashburton District" } },
      { attributes: { major_name: "Auckland", major_name_type: "City", territorial_authority: "Auckland" } },
      { attributes: { major_name: "Synthetic park", major_name_type: "National Park", territorial_authority: "Selwyn District" } },
    ] }));
    const groups = await new LinzLocalitiesProvider(fetcher as typeof fetch).cityGroups();
    expect(groups.map(group => group.region)).toEqual(["Auckland", "Canterbury"]);
    expect(groups.find(group => group.region === "Canterbury")?.cities).toEqual(["Ashburton District", "Christchurch City", "Selwyn District"]);
  });

  it("constrains suburb searches to the selected region and rejects a mismatched city", async () => {
    const fetcher = vi.fn(async (_url: URL) => Response.json({ features: [{ attributes: { ...attributes, major_name_type: "City" } }] }));
    const provider = new LinzLocalitiesProvider(fetcher as typeof fetch);
    expect(await provider.search("Riccarton", "Auckland", "Canterbury")).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await provider.search("Riccarton", "Christchurch City", "Canterbury");
    expect(fetcher.mock.calls[1][0].searchParams.get("where")).toContain("territorial_authority IN ('Christchurch City')");
    expect(await provider.search("Riccarton", undefined, "Unknown region")).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps stable identity and city context and shares concurrent lookups", async () => {
    const fetcher = vi.fn(async () => Response.json({ features: [{ attributes }] }));
    const provider = new LinzLocalitiesProvider(fetcher as typeof fetch);
    const [a, b] = await Promise.all([provider.search("Riccarton", "Christchurch"), provider.search("Riccarton", "Christchurch")]);
    expect(a).toEqual(b);
    expect(a[0]).toEqual({ id: "1394", name: "Riccarton", city: "Christchurch", territorialAuthority: "Christchurch City" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("escapes literals and removes wildcard input", async () => {
    const fetcher = vi.fn(async (_url: URL) => Response.json({ features: [] }));
    await new LinzLocalitiesProvider(fetcher as typeof fetch).search("O'B_%", "City's");
    expect(fetcher.mock.calls[0][0].searchParams.get("where")).toContain("major_name = 'City''s'");
    expect(fetcher.mock.calls[0][0].searchParams.get("where")).toContain("'%O''B%'");
  });
  it("loads geometry for the selected stable id, without trusting client coordinates", async () => {
    const fetcher = vi.fn(async (_url: URL) => Response.json({ features: [{ attributes, geometry: { rings: [[[172,-44],[173,-44],[173,-43],[172,-44]]] } }] }));
    const result = await new LinzLocalitiesProvider(fetcher as typeof fetch).resolve("1394");
    expect(result.scope.kind).toBe("SUBURB_BOUNDARY");
    expect(fetcher.mock.calls[0][0].searchParams.get("where")).toBe("id = 1394");
    expect(fetcher.mock.calls[0][0].searchParams.get("outSR")).toBe("4326");
  });
  it("rejects errors, incomplete lists and invalid geometry instead of inventing a centre", async () => {
    for (const payload of [{ error: { code: 500 } }, { exceededTransferLimit: true, features: [] }]) {
      await expect(new LinzLocalitiesProvider(vi.fn(async () => Response.json(payload)) as typeof fetch).search("Riccarton")).rejects.toThrow();
    }
    await expect(new LinzLocalitiesProvider(vi.fn(async () => Response.json({ features: [{ attributes }] })) as typeof fetch).resolve("1394")).rejects.toThrow();
  });
});

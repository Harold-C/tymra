import { describe, expect, it } from "vitest";

import {
  lincolnKeyDatesExtractionSchema,
  normaliseLincolnKeyDateSignals,
} from "../src/collection/lincoln-university-key-dates";

const sourceUrl = "https://www.lincoln.ac.nz/study/key-dates/2026-academic-key-dates/";

describe("Lincoln University key-date normalisation", () => {
  it("promotes only resolved demand dates in the requested range", () => {
    const extraction = lincolnKeyDatesExtractionSchema.parse({
      data_schema: "lincoln-university-key-dates.collect_key_dates",
      schema_version: "1.0.0",
      extractor: "lincoln_university_key_dates",
      kind: "academic_key_dates",
      institution: "Lincoln University",
      academicYear: 2026,
      title: "2026 academic key dates",
      canonicalUrl: sourceUrl,
      connector: { id: "lincoln-university-key-dates", version: "1.0.0", browserMode: "headed" },
      rawVisibleText: "key dates",
      keyDates: [
        keyDate("lincoln:graduation", "Graduation", "GRADUATION", true, "2026-05-01"),
        keyDate("lincoln:deadline", "Enrolment deadline", "ADMINISTRATIVE", false, "2026-05-02"),
        { ...keyDate("lincoln:open-day", "Open Day", "OPEN_DAY", true, "2026-05-03"), startsOn: null, endsOn: null, startsAt: null, endsAt: null, advertisedDate: "TBC", dateStatus: "DATE_UNRESOLVED" },
        keyDate("lincoln:outside", "Semester 2 classes start", "SEMESTER_START", true, "2026-07-20"),
      ],
      quality: "partial",
      missingFields: ["keyDates[2].startsOn"],
      warnings: ["DATE_UNRESOLVED:TBC"],
      fieldSources: { keyDates: "academic dates table" },
    });

    const signals = normaliseLincolnKeyDateSignals(extraction, {
      from: new Date("2026-05-01T00:00:00.000Z"),
      to: new Date("2026-05-31T23:59:59.999Z"),
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      externalId: "lincoln:graduation",
      sourceId: "christchurch_university_dates",
      type: "UNIVERSITY_CALENDAR",
      marketKey: "christchurch",
      confidence: 0.88,
      metadata: { institution: "Lincoln University", category: "GRADUATION" },
    });
    expect(signals[0]?.startsAt.toISOString()).toBe("2026-04-30T12:00:00.000Z");
    expect(signals[0]?.endsAt.toISOString()).toBe("2026-05-01T11:59:59.000Z");
  });
});

function keyDate(id: string, title: string, category: string, demandRelevant: boolean, date: string) {
  return {
    id,
    institution: "Lincoln University",
    academicYear: 2026,
    title,
    advertisedDate: date,
    startsOn: date,
    endsOn: date,
    startsAt: `${date}T00:00:00`,
    endsAt: `${date}T23:59:59`,
    dateStatus: "RESOLVED",
    category,
    demandRelevant,
    sourceUrl,
    timezone: "Pacific/Auckland",
    rawVisibleText: `${date} ${title}`,
    fieldSources: { title: "table cell" },
  };
}

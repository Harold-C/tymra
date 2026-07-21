import { describe, expect, it } from "vitest";

import { artifactMediaType, canReadArtifactContent, resolveBrowserEvidencePath } from "./raw-artifact-content";

describe("raw artifact content policy", () => {
  it("resolves browser evidence inside the configured root", () => {
    expect(resolveBrowserEvidencePath("/browser-evidence", "browser-evidence:trace/page.html")).toBe("/browser-evidence/trace/page.html");
    expect(() => resolveBrowserEvidencePath("/browser-evidence", "browser-evidence:../profile/key")).toThrow("escapes");
  });

  it("blocks sensitive, deleted and profile artifacts", () => {
    expect(canReadArtifactContent({ artifactType: "HTML", storageRef: "browser-evidence:trace/page.html", containsSensitiveData: false, deletedAt: null })).toBe(true);
    expect(canReadArtifactContent({ artifactType: "HTML", storageRef: "browser-evidence:trace/page.html", containsSensitiveData: true, deletedAt: null })).toBe(false);
    expect(canReadArtifactContent({ artifactType: "PROFILE", storageRef: "browser-evidence:trace/profile", containsSensitiveData: false, deletedAt: null })).toBe(false);
  });

  it("serves executable evidence as inert text", () => {
    expect(artifactMediaType("HTML")).toBe("text/plain; charset=utf-8");
    expect(artifactMediaType("CHALLENGE_SCREENSHOT")).toBe("image/png");
  });
});

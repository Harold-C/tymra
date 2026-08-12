import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@tymra/db", () => ({
  hashPersonalIdentifier: (value: string) => `hash:${value}`,
  prisma: {
    argusExecution: { findMany: mocks.findMany, findUnique: mocks.findUnique },
    auditEvent: { create: mocks.auditCreate },
  },
}));

import { issueArgusManualHandoff, listArgusManualActions } from "./argus-manual-actions";

const now = new Date("2026-08-13T00:00:00.000Z");
const action = {
  required: true,
  type: "novnc_handoff",
  issue_url: "/v1/handoffs",
  reason: "captcha",
  session_ttl_seconds: 900,
  session_id: `manual_${"1".repeat(32)}`,
  expires_at: "2026-08-13T00:10:00.000Z",
};
const execution = {
  id: "execution-1",
  status: "WAITING_FOR_MANUAL",
  argusJobId: `job_${"2".repeat(32)}`,
  connectorId: "airbnb-public",
  workflowId: "collect_rates",
  requestedUrl: "https://www.airbnb.co.nz/rooms/713337408265816459",
  submittedAt: now,
  result: { operator_action: action },
};

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.findMany.mockResolvedValue([]);
  mocks.auditCreate.mockResolvedValue({});
});

describe("Argus manual browser actions", () => {
  it("lists only structurally valid unexpired operator actions", async () => {
    mocks.findMany.mockResolvedValue([
      execution,
      { ...execution, id: "expired", result: { operator_action: { ...action, expires_at: "2026-08-12T23:59:00.000Z" } } },
      { ...execution, id: "invalid", result: { operator_action: { ...action, issue_url: "https://attacker.invalid" } } },
    ]);

    await expect(listArgusManualActions(now)).resolves.toEqual([expect.objectContaining({
      executionId: "execution-1",
      reason: "captcha",
      expiresAt: action.expires_at,
      sourceHost: "www.airbnb.co.nz",
    })]);
    expect(JSON.stringify(await listArgusManualActions(now))).not.toContain("/rooms/");
  });

  it("issues an allowlisted short-lived handoff and never stores its URL", async () => {
    mocks.findUnique.mockResolvedValue(execution);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      url: "https://connect.argus.test/vnc.html?path=websockify%3Ftoken%3Dephemeral",
      expires_at: "2026-08-13T00:05:00.000Z",
      session_id: action.session_id,
    }), { status: 201, headers: { "content-type": "application/json" } }));

    const result = await issueArgusManualHandoff("execution-1", "admin-1", {
      ARGUS_API_BASE_URL: "https://api.argus.test",
      ARGUS_API_TOKEN: "a".repeat(32),
      ARGUS_TIMEOUT_MS: 5_000,
      ACCESS_KEY_SECRET: "b".repeat(32),
    } as never, now);

    expect(result.url).toMatch(/^https:\/\/connect\.argus\.test\//u);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      job_id: execution.argusJobId,
      session_id: action.session_id,
      ttl_seconds: 300,
    });
    const audit = mocks.auditCreate.mock.calls[0]?.[0].data;
    expect(audit.actorAdminId).toBe("admin-1");
    expect(JSON.stringify(audit)).not.toContain("connect.argus.test");
    expect(JSON.stringify(audit)).not.toContain(action.session_id);
  });

  it("rejects a handoff URL outside the fixed Argus connect origins", async () => {
    mocks.findUnique.mockResolvedValue(execution);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      url: "https://attacker.invalid/vnc.html",
      expires_at: "2026-08-13T00:05:00.000Z",
      session_id: action.session_id,
    }), { status: 201 }));

    await expect(issueArgusManualHandoff("execution-1", "admin-1", {
      ARGUS_API_BASE_URL: "https://api.argus.test",
      ARGUS_API_TOKEN: "a".repeat(32),
      ARGUS_TIMEOUT_MS: 5_000,
      ACCESS_KEY_SECRET: "b".repeat(32),
    } as never, now)).rejects.toMatchObject({ code: "ARGUS_HANDOFF_INVALID" });
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it.each([
    "https://user:password@connect.argus.test/vnc.html",
    "https://connect.argus.test:8443/vnc.html",
  ])("rejects a handoff URL with credentials or a non-standard port: %s", async (url) => {
    mocks.findUnique.mockResolvedValue(execution);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      url,
      expires_at: "2026-08-13T00:05:00.000Z",
      session_id: action.session_id,
    }), { status: 201 }));

    await expect(issueArgusManualHandoff("execution-1", "admin-1", {
      ARGUS_API_BASE_URL: "https://api.argus.test",
      ARGUS_API_TOKEN: "a".repeat(32),
      ARGUS_TIMEOUT_MS: 5_000,
      ACCESS_KEY_SECRET: "b".repeat(32),
    } as never, now)).rejects.toMatchObject({ code: "ARGUS_HANDOFF_INVALID" });
  });

  it("rejects a handoff expiry longer than the issued TTL", async () => {
    mocks.findUnique.mockResolvedValue(execution);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      url: "https://connect.argus.test/vnc.html",
      expires_at: "2026-08-13T00:05:01.000Z",
      session_id: action.session_id,
    }), { status: 201 }));

    await expect(issueArgusManualHandoff("execution-1", "admin-1", {
      ARGUS_API_BASE_URL: "https://api.argus.test",
      ARGUS_API_TOKEN: "a".repeat(32),
      ARGUS_TIMEOUT_MS: 5_000,
      ACCESS_KEY_SECRET: "b".repeat(32),
    } as never, now)).rejects.toMatchObject({ code: "ARGUS_HANDOFF_INVALID" });
  });
});

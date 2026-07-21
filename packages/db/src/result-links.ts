import type { PriceCheckStatus, ResultAccessToken, ResultVersion } from "@prisma/client";

import { prisma } from "./index";
import { hashOpaqueToken, issueOpaqueToken } from "./security";

export type ResultLinkState = "VALID" | "EXPIRED" | "WITHDRAWN" | "SUPERSEDED" | "INVALID";

export type ResolvedResultLink =
  | { state: "INVALID" | "EXPIRED" | "WITHDRAWN"; result: null }
  | {
      state: "VALID" | "SUPERSEDED";
      result: ResultVersion & {
        priceCheck: {
          id: string;
          locale: string;
          status: PriceCheckStatus;
          property: { canonicalName: string } | null;
          unit: { officialName: string } | null;
          stayQuery: {
            checkIn: Date;
            checkOut: Date;
            nights: number;
            adults: number;
            children: number;
            units: number;
            currency: string;
            timezone: string;
          } | null;
        };
        insights: Array<{
          id: string;
          stayDate: Date;
          risk: string;
          reasonCodes: unknown;
          marketSignalIds: unknown;
          targetPriceMinor: number | null;
          competitorMedianMinor: number | null;
          competitorLowMinor: number | null;
          competitorHighMinor: number | null;
          recommendedAction: string;
          confidence: string;
          limitations: unknown;
          explanation: unknown;
        }>;
      };
    };

export async function issueResultLink(
  resultVersionId: string,
  secret: string,
  ttlDays = 14,
  now: Date = new Date(),
): Promise<{ token: string; access: ResultAccessToken }> {
  const { token, tokenHash } = issueOpaqueToken(secret);
  const access = await prisma.resultAccessToken.create({
    data: {
      resultVersionId,
      tokenHash,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + ttlDays * 86_400_000),
    },
  });
  return { token, access };
}

export async function resolveResultLink(token: string, secret: string, now: Date = new Date()): Promise<ResolvedResultLink> {
  const tokenHash = hashOpaqueToken(token, secret);
  const access = await prisma.resultAccessToken.findUnique({
    where: { tokenHash },
    select: {
      revokedAt: true,
      expiresAt: true,
      resultVersion: {
        include: {
          priceCheck: {
            select: {
              id: true,
              locale: true,
              status: true,
              property: { select: { canonicalName: true } },
              unit: { select: { officialName: true } },
              stayQuery: {
                select: {
                  checkIn: true,
                  checkOut: true,
                  nights: true,
                  adults: true,
                  children: true,
                  units: true,
                  currency: true,
                  timezone: true,
                },
              },
            },
          },
          insights: { orderBy: [{ risk: "desc" }, { stayDate: "asc" }], take: 5 },
        },
      },
    },
  });

  if (!access) return { state: "INVALID", result: null };
  if (access.revokedAt || access.resultVersion.status === "WITHDRAWN") return { state: "WITHDRAWN", result: null };
  if (access.expiresAt <= now) return { state: "EXPIRED", result: null };
  if (access.resultVersion.status === "SUPERSEDED") return { state: "SUPERSEDED", result: access.resultVersion };
  return { state: "VALID", result: access.resultVersion };
}

export async function revokeResultLinks(resultVersionId: string, reason: string, now: Date = new Date()): Promise<number> {
  const result = await prisma.resultAccessToken.updateMany({
    where: { resultVersionId, revokedAt: null },
    data: { revokedAt: now, revokeReason: reason.slice(0, 500) },
  });
  return result.count;
}


import { z } from "zod";

export const funnelEventNames = [
  "rough_check_started",
  "rough_check_completed",
  "rough_result_viewed",
  "formal_unlock_requested",
  "verification_email_queued",
  "verification_completed",
  "customer_session_created",
  "formal_check_queued",
  "formal_result_viewed",
  "abuse_challenge_required",
  "quota_reached",
] as const;

const safeCode = z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/);

export const funnelEventSchema = z.object({
  name: z.enum(funnelEventNames),
  occurredAt: z.date().optional(),
  dimensions: z.object({
    locale: z.enum(["en", "zh"]).optional(),
    platform: safeCode.optional(),
    outcome: safeCode.optional(),
    reasonCode: safeCode.optional(),
    reused: z.boolean().optional(),
    isDemo: z.boolean().optional(),
  }).strict().default({}),
}).strict();

export type FunnelEvent = z.infer<typeof funnelEventSchema>;

export const publicEventNames = [
  "homepage_viewed",
  "language_changed",
  "search_focused",
  "input_started",
  "property_search_submitted",
  "property_candidate_selected",
  "unit_selected",
  "stay_query_confirmed",
  "price_check_created",
  "confirmation_required",
  "check_status_viewed",
  "result_viewed",
  "insight_expanded",
  "feedback_submitted",
  "waitlist_submitted",
] as const;

export const operationalEventNames = [
  "exception_created",
  "exception_resolved",
  "collection_started",
  "collection_failed",
  "analysis_completed",
  "auto_publish_succeeded",
  "auto_publish_blocked",
  "result_published",
  "result_withdrawn",
  "source_health_changed",
  "market_coverage_changed",
] as const;

export type PublicEventName = (typeof publicEventNames)[number];
export type OperationalEventName = (typeof operationalEventNames)[number];


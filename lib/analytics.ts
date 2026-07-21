import type { InputType } from "./home-validation";
import type { Locale } from "./home-content";

export type HomepageEventName =
  | "homepage_viewed"
  | "language_changed"
  | "search_focused"
  | "input_started"
  | "property_search_submitted"
  | "property_candidate_selected"
  | "unit_selected"
  | "stay_query_confirmed"
  | "price_check_created"
  | "confirmation_required"
  | "check_status_viewed"
  | "result_viewed"
  | "insight_expanded"
  | "feedback_submitted"
  | "waitlist_submitted";

export type HomepageEvent = {
  name: HomepageEventName;
  properties?: {
    locale?: Locale;
    inputType?: InputType;
    deviceType?: "desktop" | "mobile";
    validationCode?: string;
    target?: string;
    opened?: boolean;
  };
};

declare global {
  interface Window {
    tymraAnalytics?: {
      track: (event: HomepageEvent) => void;
    };
  }
}

export function trackEvent(event: HomepageEvent) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent<HomepageEvent>("tymra:analytics", { detail: event }));
  window.tymraAnalytics?.track(event);
}

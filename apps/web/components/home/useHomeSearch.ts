"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import type { Locale } from "../../lib/home-content";
import { getInputType, validateHomeInput } from "../../lib/home-validation";
import { trackEvent } from "../../lib/analytics";
import type { SearchState } from "./search-types";
import { getDeviceType } from "./search-device";

export function useHomeSearch(locale: Locale) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputStarted = useRef(false);
  const roughRequestKey = useRef<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [searchState, setSearchState] = useState<SearchState>({ status: "idle", value: "" });

  const value = searchState.value;

  useEffect(() => {
    setHydrated(true);
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    trackEvent({ name: "homepage_viewed", properties: { locale, deviceType: getDeviceType() } });
  }, [locale]);

  function updateValue(nextValue: string) {
    roughRequestKey.current = null;
    if (!inputStarted.current && nextValue.trim()) {
      inputStarted.current = true;
      trackEvent({ name: "input_started", properties: { locale, inputType: getInputType(nextValue), deviceType: getDeviceType() } });
    }

    setSearchState(nextValue.trim() ? { status: "typing", value: nextValue } : { status: "idle", value: nextValue });
  }

  function clearSearch() {
    inputStarted.current = false;
    roughRequestKey.current = null;
    setSearchState({ status: "idle", value: "" });
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function submitSearch(event?: FormEvent) {
    event?.preventDefault();
    const submittedValue = inputRef.current?.value ?? value;
    const challengeToken = searchState.status === "challenge" ? searchState.challenge.token : undefined;
    const result = validateHomeInput(submittedValue, locale);

    if (!result.ok) {
      trackEvent({
        name: "property_search_submitted",
        properties: {
          locale,
          inputType: result.inputType,
          validationCode: result.code,
          deviceType: getDeviceType(),
        },
      });

      setSearchState({
        status: "validationError",
        value: submittedValue,
        error: { code: result.code, message: result.message },
      });
      return;
    }

    trackEvent({ name: "property_search_submitted", properties: { locale, inputType: result.inputType, deviceType: getDeviceType() } });
    const normalizedInput = /^https?:\/\//i.test(submittedValue.trim()) ? submittedValue.trim() : `https://${submittedValue.trim()}`;
    setSearchState({ status: "submitting", value: submittedValue });
    try {
      const response = await fetch("/api/v1/rough-checks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          input: normalizedInput,
          locale,
          idempotencyKey: roughRequestKey.current ?? (roughRequestKey.current = crypto.randomUUID()),
          ...(challengeToken ? { challengeToken } : {}),
        }),
      });
      const payload = await response.json() as { data?: { id: string }; error?: { code?: string; message?: string; fieldErrors?: Record<string, string[]>; details?: { challenge?: { mode: "deterministic" | "managed"; token?: string; siteKey?: string } } } };
      if (!response.ok || !payload.data) {
        const challenge = payload.error?.details?.challenge;
        if (payload.error?.code === "ROUGH_CHECK_CHALLENGE_REQUIRED" && challenge) {
          setSearchState({ status: "challenge", value: submittedValue, challenge });
          return;
        }
        const message = payload.error?.fieldErrors?.input?.[0]
          ?? payload.error?.message
          ?? (locale === "zh" ? "暂时无法检查这个房源链接，请稍后重试。" : "This listing could not be checked. Please try again.");
        setSearchState({ status: "validationError", value: submittedValue, error: { code: "unsupportedUrl", message } });
        return;
      }
      router.push(`/${locale}/rough/${payload.data.id}`);
    } catch {
      setSearchState({
        status: "validationError",
        value: submittedValue,
        error: {
          code: "unsupportedUrl",
          message: locale === "zh" ? "暂时无法连接到检查服务，请稍后重试。" : "The check service is temporarily unavailable. Please try again.",
        },
      });
    }
  }

  function focusSearchFromHeader() {
    inputRef.current?.focus();
    inputRef.current?.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  }

  return { inputRef, hydrated, searchState, value, updateValue, clearSearch, submitSearch, focusSearchFromHeader };
}

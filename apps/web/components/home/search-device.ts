import { DeviceType } from "./search-types";

export function getDeviceType(): DeviceType {
  if (typeof window === "undefined") return "desktop";
  return window.matchMedia("(max-width: 1023px)").matches ? "mobile" : "desktop";
}

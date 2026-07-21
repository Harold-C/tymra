export const READ_ONLY_ACTIONS = Object.freeze([
  "open_url",
  "wait_for_page_ready",
  "wait_for_selector",
  "capture_screenshot",
  "capture_html",
  "get_title",
  "get_url",
  "scroll",
  "click_readonly",
  "hover",
  "select",
  "close",
]);

export const MUTATING_ACTIONS = Object.freeze([
  "submit",
  "save",
  "send",
  "confirm",
  "cancel",
  "payment",
  "order",
  "upload",
  "type",
  "keyboard",
  "mark_read",
  "modify_remote_state",
]);

export function createReadOnlyActionPolicy(input = {}) {
  const allowed = input.allowedActions ?? READ_ONLY_ACTIONS;
  return Object.freeze({
    tier: "read_only",
    readonlyOnly: true,
    externalSideEffectsAllowed: false,
    allowedActions: Object.freeze([...new Set(allowed)]),
    deniedActions: MUTATING_ACTIONS,
  });
}

export function assertActionAllowed(action, policy = createReadOnlyActionPolicy()) {
  if (policy.externalSideEffectsAllowed || !policy.readonlyOnly) {
    throw new BrowserPolicyError("INVALID_ACTION_POLICY", "Browser tasks must remain read-only");
  }
  if (policy.deniedActions.includes(action) || !policy.allowedActions.includes(action)) {
    throw new BrowserPolicyError("ACTION_DENIED", `Action denied by read-only policy: ${action}`);
  }
  return true;
}

export class BrowserPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BrowserPolicyError";
    this.code = code;
  }
}

// Central brand identity. The product name was intentionally left as a
// deferred decision during design — change these two constants to rebrand
// everything (channel name, notifications, status bar) in one place.
// The command IDs / config keys in package.json use the internal id "onesub".
export const BRAND = {
  /** Human-facing product name. */
  name: "OneSub",
  /** Internal id used for command namespaces and the output channel id. */
  id: "onesub"
} as const;

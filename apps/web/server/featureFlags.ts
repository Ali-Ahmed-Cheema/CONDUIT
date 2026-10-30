import { resolveFeatureFlags } from "@conduit/core";

export function getServerFeatureFlags() {
  return resolveFeatureFlags((name) => process.env[`CONDUIT_FEATURE_${name}`]);
}

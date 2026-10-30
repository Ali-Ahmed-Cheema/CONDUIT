import { resolveFeatureFlags } from "@conduit/core";

export const featureFlags = resolveFeatureFlags((name) => {
  switch (name) {
    case "TYPED_API":
      return import.meta.env.VITE_CONDUIT_FEATURE_TYPED_API;
    case "AGENT_RUNTIME":
      return import.meta.env.VITE_CONDUIT_FEATURE_AGENT_RUNTIME;
    case "LOCAL_MODELS":
      return import.meta.env.VITE_CONDUIT_FEATURE_LOCAL_MODELS;
    case "RETRIEVAL":
      return import.meta.env.VITE_CONDUIT_FEATURE_RETRIEVAL;
    case "PLUGINS":
      return import.meta.env.VITE_CONDUIT_FEATURE_PLUGINS;
    case "ENCRYPTED_SYNC":
      return import.meta.env.VITE_CONDUIT_FEATURE_ENCRYPTED_SYNC;
  }
});

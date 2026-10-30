/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONDUIT_FEATURE_TYPED_API?: "0" | "1";
  readonly VITE_CONDUIT_FEATURE_AGENT_RUNTIME?: "0" | "1";
  readonly VITE_CONDUIT_FEATURE_LOCAL_MODELS?: "0" | "1";
  readonly VITE_CONDUIT_FEATURE_RETRIEVAL?: "0" | "1";
  readonly VITE_CONDUIT_FEATURE_PLUGINS?: "0" | "1";
  readonly VITE_CONDUIT_FEATURE_ENCRYPTED_SYNC?: "0" | "1";
}

import type { VaultSetup } from "@conduit/storage";

// Required only to unlock and migrate vaults created before in-app setup.
export const LEGACY_VAULT_SETUP: VaultSetup = {
  version: 1,
  saltVerify: "07e04f06ba3266c1a316e2dcbbf07121",
  verifier: "d6798ff57abecb53d45201be09b04b46fa17e682af2ff42986b3fae549ebfed7",
  saltData: "4ab61441b3da6e82e56f05a70c64285a",
};

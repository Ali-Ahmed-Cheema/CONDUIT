export type Group =
  "Visibility" | "Permission" | "Environment" | "Token" | "Machine";

type Field = {
  id: string;
  label: string;
  placeholder: string;
  secret?: boolean;
  optional?: boolean;
  multiline?: boolean;
};

export type CredentialType = {
  id: string;
  name: string;
  group: Group;
  purpose: string;
  example: string;
  result: string;
  fields: Field[];
};

const oneSecret = (label: string, placeholder: string): Field[] => [
  { id: "key", label, placeholder, secret: true },
];

export const types: CredentialType[] = [
  {
    id: "public",
    name: "Public / publishable key",
    group: "Visibility",
    purpose: "Identifies your app; intended for frontend use.",
    example: "Stripe pk_… · Maps browser key",
    result: "Public or limited results, such as map tiles or a card token.",
    fields: [{ id: "key", label: "Publishable key", placeholder: "pk_live_…" }],
  },
  {
    id: "secret",
    name: "Secret / private key",
    group: "Visibility",
    purpose: "Full API access from a trusted backend. Keep it private.",
    example: "Stripe sk_… · OpenAI sk-…",
    result: "Full API responses; usage may be billed to your account.",
    fields: oneSecret("Secret key", "Paste a secret key"),
  },
  {
    id: "restricted",
    name: "Restricted / scoped key",
    group: "Permission",
    purpose: "Limits access to specific endpoints, resources, or actions.",
    example: "Provider-scoped API key",
    result: "Allowed calls succeed; disallowed calls typically return 403.",
    fields: [
      ...oneSecret("Scoped key", "Paste a restricted key"),
      {
        id: "scopes",
        label: "Allowed scopes",
        placeholder: "e.g. invoices:read, customers:read",
        optional: true,
        multiline: true,
      },
    ],
  },
  {
    id: "read-only",
    name: "Read-only key",
    group: "Permission",
    purpose: "Allows data retrieval without changing account data.",
    example: "Analytics or reporting key",
    result: "Read requests work; write requests should be rejected.",
    fields: oneSecret("Read-only key", "Paste a read-only key"),
  },
  {
    id: "read-write",
    name: "Read-write key",
    group: "Permission",
    purpose: "Allows reading and modifying data within its configured scope.",
    example: "Service integration key",
    result: "Read and write calls work within the key's scope.",
    fields: oneSecret("Read-write key", "Paste a read-write key"),
  },
  {
    id: "admin",
    name: "Admin / master key",
    group: "Permission",
    purpose: "Manages account settings, billing, users, or other keys.",
    example: "Account administrator key",
    result: "Can have full control, including creating or deleting keys.",
    fields: oneSecret("Admin key", "Paste an admin key"),
  },
  {
    id: "test",
    name: "Test / sandbox key",
    group: "Environment",
    purpose: "For development against a test environment.",
    example: "Stripe sk_test_…",
    result: "Uses test data and should not cause real-world effects.",
    fields: oneSecret("Sandbox key", "Paste a test key"),
  },
  {
    id: "live",
    name: "Live / production key",
    group: "Environment",
    purpose: "For a production integration with real users.",
    example: "Stripe sk_live_…",
    result: "May access real data and cause real charges or other effects.",
    fields: oneSecret("Production key", "Paste a live key"),
  },
  {
    id: "access",
    name: "Bearer / access token",
    group: "Token",
    purpose: "Short-lived OAuth 2.0 access on behalf of a user.",
    example: "OAuth 2.0 bearer token",
    result: "Returns user data within granted scopes until it expires.",
    fields: [
      {
        id: "token",
        label: "Access token",
        placeholder: "Paste an access token",
        secret: true,
      },
      {
        id: "scopes",
        label: "Granted scopes",
        placeholder: "e.g. profile:read, calendar:read",
        optional: true,
      },
      {
        id: "expiry",
        label: "Expiration time",
        placeholder: "",
        optional: true,
      },
    ],
  },
  {
    id: "refresh",
    name: "Refresh token",
    group: "Token",
    purpose: "Obtains new access tokens without requiring another sign-in.",
    example: "OAuth 2.0 refresh token",
    result:
      "Can exchange for an access token; does not call data APIs directly.",
    fields: [
      {
        id: "token",
        label: "Refresh token",
        placeholder: "Paste a refresh token",
        secret: true,
      },
      {
        id: "expiry",
        label: "Expiration time",
        placeholder: "",
        optional: true,
      },
    ],
  },
  {
    id: "jwt",
    name: "JWT (JSON Web Token)",
    group: "Token",
    purpose: "Signed token carrying claims such as a user ID or role.",
    example: "eyJ… header.payload.signature",
    result: "A server verifies its signature and applies the token's claims.",
    fields: [
      { id: "token", label: "JWT", placeholder: "eyJ…", secret: true },
      {
        id: "expiry",
        label: "Expiration time (if known)",
        placeholder: "",
        optional: true,
      },
    ],
  },
  {
    id: "pat",
    name: "Personal access token (PAT)",
    group: "Token",
    purpose: "User-generated token for scripts and tools.",
    example: "GitHub ghp_… · GitLab glpat-…",
    result: "Acts as the user within the selected scopes.",
    fields: [
      {
        id: "token",
        label: "Personal access token",
        placeholder: "Paste a PAT",
        secret: true,
      },
      {
        id: "scopes",
        label: "Granted scopes",
        placeholder: "e.g. repository:read",
        optional: true,
      },
      {
        id: "expiry",
        label: "Expiration time (if known)",
        placeholder: "",
        optional: true,
      },
    ],
  },
  {
    id: "temporary",
    name: "Temporary credentials",
    group: "Token",
    purpose: "Short-lived credentials, such as AWS STS credentials.",
    example: "Access key + secret + session token",
    result:
      "Works until expiration; expired credentials typically return 401/403.",
    fields: [
      {
        id: "accessId",
        label: "Access key ID",
        placeholder: "Enter access key ID",
      },
      {
        id: "secret",
        label: "Secret access key",
        placeholder: "Enter secret access key",
        secret: true,
      },
      {
        id: "session",
        label: "Session token",
        placeholder: "Enter session token",
        secret: true,
      },
      {
        id: "expiry",
        label: "Expiration time",
        placeholder: "",
        optional: true,
      },
    ],
  },
  {
    id: "pair",
    name: "Key ID + secret pair",
    group: "Machine",
    purpose:
      "Identifies a client and signs requests with a corresponding secret.",
    example: "AWS · Twilio · Binance",
    result:
      "The service checks the request signature; an invalid signature fails authentication.",
    fields: [
      { id: "id", label: "Key ID", placeholder: "Enter key ID" },
      {
        id: "secret",
        label: "Secret",
        placeholder: "Enter signing secret",
        secret: true,
      },
    ],
  },
  {
    id: "service",
    name: "Service account key",
    group: "Machine",
    purpose: "Server-to-server access as a non-human service identity.",
    example: "Google Cloud service account JSON",
    result:
      "Lets a backend call cloud APIs as the configured service identity.",
    fields: [
      {
        id: "json",
        label: "Service account JSON",
        placeholder: '{\n  "type": "service_account",\n  …\n}',
        secret: true,
        multiline: true,
      },
    ],
  },
  {
    id: "webhook",
    name: "Webhook signing secret",
    group: "Machine",
    purpose:
      "Verifies that incoming webhook events came from a trusted sender.",
    example: "Stripe whsec_…",
    result:
      "Validates the request signature header; it is not used to call an API.",
    fields: oneSecret("Signing secret", "Paste the webhook signing secret"),
  },
];

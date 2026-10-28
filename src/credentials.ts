export type CredentialField = {
  id: string;
  label: string;
  type: "secret" | "text" | "textarea" | "date" | "number";
  placeholder: string;
  required?: boolean;
  helper?: string;
};

export type CredentialCategory =
  | "Visibility"
  | "Permissions"
  | "Environment"
  | "Tokens"
  | "Machine credentials";

export type CredentialType = {
  id: string;
  name: string;
  category: CredentialCategory;
  description: string;
  example: string;
  output: string;
  warning?: string;
  fields: CredentialField[];
};

const oneSecret = (label: string, placeholder: string): CredentialField[] => [
  { id: "key", label, type: "secret", placeholder },
];

export const credentialTypes: CredentialType[] = [
  {
    id: "public",
    name: "Public / publishable key",
    category: "Visibility",
    description: "Identifies your app and is designed to be used in frontend code.",
    example: "Stripe pk_… · Google Maps browser key",
    output: "Public or limited results, such as map tiles or a card token.",
    fields: oneSecret("Publishable key", "pk_…"),
  },
  {
    id: "secret",
    name: "Secret / private key",
    category: "Visibility",
    description: "Full-access credential intended for trusted server-side code, not a public frontend.",
    example: "Stripe sk_… · OpenAI sk-… · Anthropic key",
    output: "Full API responses; usage is billed to the account that owns the key.",
    warning: "Treat this credential as sensitive. Never paste a production secret into an untrusted app.",
    fields: oneSecret("Secret key", "Paste a secret key"),
  },
  {
    id: "restricted",
    name: "Restricted / scoped key",
    category: "Permissions",
    description: "Limits a credential to selected endpoints, resources, or actions.",
    example: "A provider key scoped to selected API endpoints",
    output: "Allowed calls succeed; disallowed calls typically return 403 Forbidden.",
    fields: [
      ...oneSecret("Restricted key", "Paste a restricted key"),
      { id: "scopes", label: "Allowed scopes", type: "textarea", placeholder: "e.g. invoices:read, customers:read", helper: "List the permissions granted to this key." },
    ],
  },
  {
    id: "read-only",
    name: "Read-only key",
    category: "Permissions",
    description: "Can retrieve data but cannot change it.",
    example: "A reporting or analytics API key",
    output: "Read requests work; write requests are rejected.",
    fields: oneSecret("Read-only key", "Paste a read-only key"),
  },
  {
    id: "read-write",
    name: "Read-write key",
    category: "Permissions",
    description: "Can retrieve and modify data within its assigned scope.",
    example: "An application integration key",
    output: "Read and write calls work within the key's scope.",
    fields: oneSecret("Read-write key", "Paste a read-write key"),
  },
  {
    id: "admin",
    name: "Admin / master key",
    category: "Permissions",
    description: "Can manage an account, its settings, billing, or other credentials.",
    example: "An account-owner or organization admin key",
    output: "Full administrative control, including creating or revoking keys.",
    warning: "High impact: use only when absolutely necessary and keep it out of client-side applications.",
    fields: oneSecret("Admin key", "Paste an admin key"),
  },
  {
    id: "test",
    name: "Test / sandbox key",
    category: "Environment",
    description: "Connects to a provider's development or sandbox environment.",
    example: "Stripe test key · provider sandbox token",
    output: "Test data and simulated actions; normally no real charges or messages.",
    fields: oneSecret("Sandbox key", "Paste a test or sandbox key"),
  },
  {
    id: "live",
    name: "Live / production key",
    category: "Environment",
    description: "Connects to a provider's production environment.",
    example: "A live payment or production API key",
    output: "Real data and real-world effects, which may include charges.",
    warning: "Production credentials can trigger real actions and charges.",
    fields: oneSecret("Production key", "Paste a live key"),
  },
  {
    id: "access-token",
    name: "Bearer / access token",
    category: "Tokens",
    description: "An OAuth 2.0 token that acts for a user within granted scopes.",
    example: "Authorization: Bearer …",
    output: "The user's permitted data; access tokens usually expire.",
    fields: [
      ...oneSecret("Access token", "Paste an access token"),
      { id: "scopes", label: "Granted scopes", type: "textarea", placeholder: "e.g. profile:read, calendar:read" },
      { id: "expiresAt", label: "Expires on", type: "date", placeholder: "", required: false },
    ],
  },
  {
    id: "refresh-token",
    name: "Refresh token",
    category: "Tokens",
    description: "Obtains new access tokens without asking the user to sign in again.",
    example: "OAuth 2.0 refresh token",
    output: "A new access token; a refresh token does not call data endpoints directly.",
    warning: "Refresh tokens can provide ongoing access. Store and share them carefully.",
    fields: [
      ...oneSecret("Refresh token", "Paste a refresh token"),
      { id: "expiresAt", label: "Expires on (if known)", type: "date", placeholder: "", required: false },
    ],
  },
  {
    id: "jwt",
    name: "JWT",
    category: "Tokens",
    description: "A signed token carrying claims such as a user ID, role, or expiry.",
    example: "eyJ… header.payload.signature",
    output: "A server verifies its signature and applies the claims and permissions.",
    fields: oneSecret("JSON Web Token", "Paste a JWT"),
  },
  {
    id: "pat",
    name: "Personal access token (PAT)",
    category: "Tokens",
    description: "A user-generated token for scripts and tools, limited by its scopes.",
    example: "GitHub or GitLab personal access token",
    output: "Acts as the user who created it, within the selected scopes.",
    fields: [
      ...oneSecret("Personal access token", "Paste a PAT"),
      { id: "scopes", label: "Granted scopes", type: "textarea", placeholder: "e.g. repository:read" },
      { id: "expiresAt", label: "Expires on (if known)", type: "date", placeholder: "", required: false },
    ],
  },
  {
    id: "temporary",
    name: "Temporary credentials",
    category: "Tokens",
    description: "Short-lived credentials, often issued for a specific session or role.",
    example: "AWS STS access key, secret key, and session token",
    output: "Works until the expiry time; expired credentials usually return 401 or 403.",
    fields: [
      { id: "accessKeyId", label: "Access key ID", type: "text", placeholder: "Temporary access key ID" },
      { id: "secretAccessKey", label: "Secret access key", type: "secret", placeholder: "Paste the secret access key" },
      { id: "sessionToken", label: "Session token", type: "secret", placeholder: "Paste the session token" },
      { id: "expiresAt", label: "Expires on", type: "date", placeholder: "", required: false },
    ],
  },
  {
    id: "key-pair",
    name: "Key ID + secret pair",
    category: "Machine credentials",
    description: "Uses an identifier and a secret together to authenticate or sign requests.",
    example: "AWS · Twilio · Binance",
    output: "The service checks the credentials or request signature; an invalid signature is rejected.",
    fields: [
      { id: "keyId", label: "Key ID", type: "text", placeholder: "Enter the key ID" },
      { id: "keySecret", label: "Key secret", type: "secret", placeholder: "Paste the key secret" },
    ],
  },
  {
    id: "service-account",
    name: "Service account key",
    category: "Machine credentials",
    description: "Lets a backend call APIs as a non-human service identity.",
    example: "Google Cloud service account JSON",
    output: "Calls run with the roles and permissions assigned to the service identity.",
    warning: "Do not upload a service account file. Paste its contents only into a trusted local environment.",
    fields: [
      { id: "serviceAccountJson", label: "Service account JSON", type: "textarea", placeholder: '{\n  "type": "service_account",\n  "project_id": "…"\n}', helper: "Keep private-key data confidential. This form does not upload or save it." },
    ],
  },
  {
    id: "webhook",
    name: "Webhook signing secret",
    category: "Machine credentials",
    description: "Verifies that an incoming webhook was signed by a trusted sender.",
    example: "A provider's webhook endpoint signing secret",
    output: "A valid signature means the event can be trusted; an invalid one should be rejected.",
    fields: oneSecret("Signing secret", "Paste the webhook signing secret"),
  },
];

export const credentialCategories: CredentialCategory[] = [
  "Visibility",
  "Permissions",
  "Environment",
  "Tokens",
  "Machine credentials",
];

export const credentialRestrictions = [
  { id: "ip", label: "IP address", description: "Allow requests only from trusted server IPs.", field: { label: "Allowed IPs", placeholder: "203.0.113.10, 2001:db8::1" } },
  { id: "domain", label: "HTTP referrer / domain", description: "Limit use to approved website origins.", field: { label: "Allowed domains", placeholder: "https://app.example.com" } },
  { id: "app", label: "Mobile app", description: "Restrict use to an Android package or iOS bundle ID.", field: { label: "Package or bundle ID", placeholder: "com.example.app" } },
  { id: "quota", label: "Rate limit / quota", description: "Cap how frequently or how much the credential can be used.", field: { label: "Request limit", placeholder: "e.g. 1,000 requests / day" } },
] as const;

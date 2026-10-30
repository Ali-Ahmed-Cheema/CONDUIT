import { HealthResponseSchema } from "@conduit/core";
import { ApiRequestError } from "./api";
import { featureFlags } from "./featureFlags";
import type { paths } from "./generated/openapi";

type HealthResponse = paths["/health"]["get"]["responses"][200]["content"]["application/json"];

export async function getTypedApiHealth(
  fetcher: typeof fetch = fetch,
  enabled = featureFlags.typedApi,
): Promise<HealthResponse> {
  if (!enabled) {
    throw new ApiRequestError("The typed API feature is disabled.", "FEATURE_DISABLED");
  }
  const response = await fetcher("/api/v4/health");
  if (!response.ok) {
    throw new ApiRequestError(`Typed API health check failed (${response.status}).`, undefined, response.status);
  }
  const parsed = HealthResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiRequestError("The typed API returned an invalid health response.", "INVALID_RESPONSE", response.status);
  }
  return parsed.data;
}

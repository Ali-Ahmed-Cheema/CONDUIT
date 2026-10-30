import { describe, expect, it, vi } from "vitest";
import { getTypedApiHealth } from "../apiV4";

describe("typed API client", () => {
  it("does not make a request while its feature flag is disabled", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(getTypedApiHealth(fetcher, false)).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("parses health responses against the shared runtime schema", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ ok: true }),
      { headers: { "Content-Type": "application/json" } },
    ));

    await expect(getTypedApiHealth(fetcher, true)).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith("/api/v4/health");
  });

  it("rejects malformed health responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ ok: false }),
      { headers: { "Content-Type": "application/json" } },
    ));

    await expect(getTypedApiHealth(fetcher, true)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
});

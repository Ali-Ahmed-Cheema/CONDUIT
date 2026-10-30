import { getRequestListener } from "@hono/node-server";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { RequestHandler } from "express";

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ ok: z.literal(true) }),
        },
      },
      description: "Reports whether the opt-in typed API is available.",
    },
  },
});

export const typedApi = new OpenAPIHono();

typedApi.openapi(healthRoute, (context) => context.json({ ok: true }, 200));
typedApi.doc("/openapi.json", {
  openapi: "3.0.0",
  info: {
    title: "CONDUIT local API",
    version: "4.0.0-alpha",
  },
  servers: [{ url: "/api/v4" }],
});

const typedApiRequestListener = getRequestListener(typedApi.fetch);

export function createTypedApiMiddleware(isEnabled: () => boolean): RequestHandler {
  return (request, response, next) => {
    if (!isEnabled()) {
      response.status(404).json({ error: "The typed API is disabled." });
      return;
    }
    typedApiRequestListener(request, response).catch(next);
  };
}

import express from "express";
import supertest from "supertest";
import { describe, expect, it } from "vitest";
import { createTypedApiMiddleware } from "./v4Api";

describe("opt-in typed API", () => {
  it("serves OpenAPI-described health routes when explicitly enabled", async () => {
    const app = express();
    app.use("/api/v4", createTypedApiMiddleware(() => true));

    const health = await supertest(app).get("/api/v4/health").expect(200);
    const document = await supertest(app).get("/api/v4/openapi.json").expect(200);

    expect(health.body).toEqual({ ok: true });
    expect(document.body).toMatchObject({
      openapi: "3.0.0",
      info: { title: "CONDUIT local API", version: "4.0.0-alpha" },
      paths: { "/health": { get: expect.any(Object) } },
    });
  });

  it("returns an explicit 404 when the feature flag is disabled", async () => {
    const app = express();
    app.use("/api/v4", createTypedApiMiddleware(() => false));

    await supertest(app)
      .get("/api/v4/health")
      .expect(404, { error: "The typed API is disabled." });
  });
});

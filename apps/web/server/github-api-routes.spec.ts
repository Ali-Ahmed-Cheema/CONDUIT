import { afterEach, describe, expect, it, vi } from "vitest";
import supertest from "supertest";

const keyStore = vi.hoisted(() => ({
  decryptApiKey: vi.fn(),
  readStore: vi.fn(),
  writeStore: vi.fn(),
}));

vi.mock("./keyStore", () => ({
  ...keyStore,
  encryptApiKey: vi.fn(),
  validateEncryptionKey: vi.fn(),
}));

import { app } from "./index";

const origin = "http://localhost:5173";

describe("GitHub repository API routes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("connects, lists, and loads repository files through the local API", async () => {
    const token = "github_pat_one_time";
    const sha = "a".repeat(40);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        full_name: "owner/repo",
        default_branch: "main",
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        truncated: false,
        tree: [{ type: "blob", path: "src/index.ts", sha, size: 12 }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        encoding: "base64",
        size: 12,
        content: Buffer.from("export {};\n").toString("base64"),
      })));
    vi.stubGlobal("fetch", fetchMock);

    const connected = await supertest(app)
      .post("/api/github/repository")
      .set("Origin", origin)
      .send({ url: "https://github.com/owner/repo", token });
    expect(connected.status).toBe(200);
    expect(connected.body).toEqual({
      owner: "owner",
      name: "repo",
      fullName: "owner/repo",
      defaultBranch: "main",
    });

    const tree = await supertest(app)
      .post("/api/github/tree")
      .set("Origin", origin)
      .send({ owner: "owner", repo: "repo", ref: "main", token });
    expect(tree.status).toBe(200);
    expect(tree.body.files).toEqual([{ path: "src/index.ts", sha, size: 12 }]);

    const file = await supertest(app)
      .post("/api/github/file")
      .set("Origin", origin)
      .send({ owner: "owner", repo: "repo", ref: "main", path: "src/index.ts", sha, token });
    expect(file.status).toBe(200);
    expect(file.body).toEqual({ path: "src/index.ts", size: 12, content: "export {};\n" });
    expect(fetchMock.mock.calls.every(([, options]) => options?.headers?.Authorization === `Bearer ${token}`)).toBe(true);
  });

  it("rejects foreign origins and invalid repository hosts before contacting GitHub", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const denied = await supertest(app)
      .post("/api/github/repository")
      .set("Origin", "https://attacker.example")
      .send({ url: "https://github.com/owner/repo" });
    const invalid = await supertest(app)
      .post("/api/github/repository")
      .set("Origin", origin)
      .send({ url: "https://attacker.example/owner/repo" });

    expect(denied.status).toBe(403);
    expect(invalid.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

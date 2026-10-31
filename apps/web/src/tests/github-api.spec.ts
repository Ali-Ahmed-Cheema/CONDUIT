import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectGitHubRepository,
  getGitHubRepositoryFile,
  getGitHubRepositoryTree,
} from "../api";

const repository = {
  owner: "owner",
  name: "repo",
  fullName: "owner/repo",
  defaultBranch: "main",
};

describe("GitHub API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends repository URLs and transient tokens to the local API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(repository)));
    vi.stubGlobal("fetch", fetchMock);

    await connectGitHubRepository("https://github.com/owner/repo", "github_pat_one_time");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/github/repository",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://github.com/owner/repo", token: "github_pat_one_time" }),
      }),
    );
  });

  it("sends branch and file identifiers and validates local API responses", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [], truncated: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        path: "src/index.ts",
        size: 10,
        content: "const x = 1;",
      })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getGitHubRepositoryTree(repository)).resolves.toEqual({ files: [], truncated: false });
    await expect(getGitHubRepositoryFile(repository, {
      path: "src/index.ts",
      sha: "a".repeat(40),
    })).resolves.toEqual({
      path: "src/index.ts",
      size: 10,
      content: "const x = 1;",
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      owner: "owner",
      repo: "repo",
      ref: "main",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      owner: "owner",
      repo: "repo",
      ref: "main",
      path: "src/index.ts",
      sha: "a".repeat(40),
    });
  });

  it("rejects malformed repository responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ owner: "owner" }))));

    await expect(connectGitHubRepository("https://github.com/owner/repo"))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

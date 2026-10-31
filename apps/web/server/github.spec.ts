import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectGitHubRepository,
  getGitHubRepositoryFile,
  getGitHubRepositoryTree,
  GitHubRequestError,
} from "./github";

describe("GitHub repository access", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("only accepts HTTPS github.com repository URLs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(connectGitHubRepository({ url: "https://evil.example/owner/repo" }))
      .rejects.toMatchObject({ status: 400 });
    await expect(connectGitHubRepository({ url: "https://github.com/owner/repo/tree/main" }))
      .rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the GitHub API, forwards optional tokens only upstream, and returns safe repository details", async () => {
    const token = "github_pat_test_private_token";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      full_name: "owner/repo",
      default_branch: "main",
    })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(connectGitHubRepository({
      url: "https://github.com/owner/repo.git",
      token,
    })).resolves.toEqual({
      owner: "owner",
      name: "repo",
      fullName: "owner/repo",
      defaultBranch: "main",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        }),
        redirect: "error",
      }),
    );
  });

  it("lists only safe blob entries", async () => {
    const sha = "a".repeat(40);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      truncated: false,
      tree: [
        { type: "blob", path: "src/index.ts", sha, size: 20 },
        { type: "tree", path: "src", sha, size: 0 },
        { type: "blob", path: "../secret.txt", sha, size: 10 },
        { type: "blob", path: "unsafe.txt", sha: "invalid", size: 10 },
      ],
    })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getGitHubRepositoryTree({
      owner: "owner",
      repo: "repo",
      ref: "main",
    })).resolves.toEqual({
      files: [{ path: "src/index.ts", sha, size: 20 }],
      truncated: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.github.com/repos/owner/repo/git/trees/main?recursive=1`,
      expect.any(Object),
    );
  });

  it("caps very large tree responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      truncated: false,
      tree: Array.from({ length: 2_501 }, (_, index) => ({
        type: "blob",
        path: `src/file-${index}.ts`,
        sha: "c".repeat(40),
        size: 10,
      })),
    })));
    vi.stubGlobal("fetch", fetchMock);

    const tree = await getGitHubRepositoryTree({ owner: "owner", repo: "repo", ref: "main" });
    expect(tree.files).toHaveLength(2_500);
    expect(tree.truncated).toBe(true);
  });

  it("returns UTF-8 blob contents and rejects binary or oversized files", async () => {
    const sha = "b".repeat(40);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      encoding: "base64",
      size: Buffer.byteLength("export const answer = 42;"),
      content: Buffer.from("export const answer = 42;").toString("base64"),
    })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getGitHubRepositoryFile({
      owner: "owner",
      repo: "repo",
      ref: "main",
      path: "src/index.ts",
      sha,
    })).resolves.toMatchObject({
      path: "src/index.ts",
      content: "export const answer = 42;",
    });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      encoding: "base64",
      size: 2,
      content: Buffer.from([0, 1]).toString("base64"),
    })));
    await expect(getGitHubRepositoryFile({
      owner: "owner",
      repo: "repo",
      ref: "main",
      path: "image.png",
      sha,
    })).rejects.toMatchObject({ status: 415 });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      encoding: "base64",
      size: 180_001,
      content: "",
    })));
    await expect(getGitHubRepositoryFile({
      owner: "owner",
      repo: "repo",
      ref: "main",
      path: "large.ts",
      sha,
    })).rejects.toMatchObject({ status: 413 });
  });

  it("does not include upstream response details or credentials in failures", async () => {
    const token = "github_pat_test_secret";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret payload", { status: 401 })));

    let caught: unknown;
    try {
      await connectGitHubRepository({ url: "https://github.com/owner/private", token });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(GitHubRequestError);
    expect(caught).toMatchObject({ status: 401 });
    expect((caught as Error).message).not.toContain(token);
  });
});

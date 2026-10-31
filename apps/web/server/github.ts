import {
  GitHubRepositoryConnectRequestSchema,
  GitHubRepositoryFileRequestSchema,
  GitHubRepositoryFileSchema,
  GitHubRepositorySchema,
  GitHubRepositoryTreeRequestSchema,
  GitHubRepositoryTreeSchema,
  type GitHubRepository,
  type GitHubRepositoryFile,
  type GitHubRepositoryTree,
} from "@conduit/core";

const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_TIMEOUT_MS = 15_000;
const MAX_FILE_BYTES = 180_000;
const MAX_TREE_FILES = 2_500;

export class GitHubRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "GitHubRequestError";
  }
}

function parseRepositoryUrl(value: string): { owner: string; repo: string } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GitHubRequestError("Enter a valid GitHub repository URL.", 400);
  }
  if (
    url.protocol !== "https:"
    || url.hostname.toLowerCase() !== "github.com"
    || url.port
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new GitHubRequestError("Use a repository URL from https://github.com.", 400);
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) throw new GitHubRequestError("Enter a GitHub URL in the form https://github.com/owner/repository.", 400);
  const owner = segments[0];
  const repo = segments[1]?.replace(/\.git$/i, "");
  if (!owner || !repo || !/^[A-Za-z0-9_.-]{1,100}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) {
    throw new GitHubRequestError("The GitHub repository URL contains an invalid owner or repository name.", 400);
  }
  return { owner, repo };
}

function apiUrl(path: string): string {
  return `${GITHUB_API}${path}`;
}

async function githubFetch(path: string, token?: string): Promise<Response> {
  const signal = AbortSignal.timeout(GITHUB_TIMEOUT_MS);
  try {
    const response = await fetch(apiUrl(path), {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "User-Agent": "CONDUIT",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal,
      redirect: "error",
    });
    if (!response.ok) {
      if (response.status === 401) throw new GitHubRequestError("GitHub rejected the token. Check that it is valid and has repository contents read access.", 401);
      if (response.status === 403 || response.status === 429) {
        const limited = response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0";
        throw new GitHubRequestError(
          limited
            ? "GitHub rate limit reached. Wait a little and try again."
            : "GitHub denied access. For a private repository, use a fine-grained token with Contents read access.",
          response.status,
        );
      }
      if (response.status === 404) throw new GitHubRequestError("Repository or file not found. Private repositories require a token with Contents read access.", 404);
      if (response.status >= 500) throw new GitHubRequestError("GitHub is temporarily unavailable. Try again later.", 502);
      throw new GitHubRequestError(`GitHub returned an unexpected response (${response.status}).`, 502);
    }
    return response;
  } catch (error) {
    if (error instanceof GitHubRequestError) throw error;
    if (signal.aborted) throw new GitHubRequestError("GitHub took too long to respond. Try again.", 504);
    throw new GitHubRequestError("Could not reach GitHub. Check your connection and try again.", 502);
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new GitHubRequestError("GitHub took too long to respond. Try again.", 504);
    }
    throw new GitHubRequestError("GitHub returned an invalid response.", 502);
  }
}

export async function connectGitHubRepository(input: unknown): Promise<GitHubRepository> {
  const parsed = GitHubRepositoryConnectRequestSchema.safeParse(input);
  if (!parsed.success) throw new GitHubRequestError("Enter a valid repository URL and token.", 400);
  const { owner, repo } = parseRepositoryUrl(parsed.data.url);
  const response = await githubFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, parsed.data.token);
  const data = await readJson(response);
  if (!data || typeof data !== "object") throw new GitHubRequestError("GitHub returned invalid repository details.", 502);
  const repository = data as Record<string, unknown>;
  const result = GitHubRepositorySchema.safeParse({
    owner,
    name: repo,
    fullName: repository.full_name,
    defaultBranch: repository.default_branch,
  });
  if (!result.success) throw new GitHubRequestError("GitHub returned incomplete repository details.", 502);
  return result.data;
}

export async function getGitHubRepositoryTree(input: unknown): Promise<GitHubRepositoryTree> {
  const parsed = GitHubRepositoryTreeRequestSchema.safeParse(input);
  if (!parsed.success) throw new GitHubRequestError("Repository, branch, or token is invalid.", 400);
  const { owner, repo, ref, token } = parsed.data;
  const response = await githubFetch(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    token,
  );
  const data = await readJson(response);
  if (!data || typeof data !== "object" || !Array.isArray((data as Record<string, unknown>).tree)) {
    throw new GitHubRequestError("GitHub returned an invalid repository file list.", 502);
  }
  const repositoryTree = data as { tree: unknown[]; truncated?: unknown };
  const entries = repositoryTree.tree.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    if (
      entry.type !== "blob"
      || typeof entry.path !== "string"
      || entry.path.length > 1_024
      || entry.path.split("/").some((segment) => segment === "." || segment === "..")
      || typeof entry.sha !== "string"
      || !/^[a-f0-9]{40,64}$/i.test(entry.sha)
      || typeof entry.size !== "number"
      || !Number.isSafeInteger(entry.size)
      || entry.size < 0
    ) return [];
    return [{ path: entry.path, sha: entry.sha, size: entry.size }];
  });
  const files = entries.slice(0, MAX_TREE_FILES);
  const result = GitHubRepositoryTreeSchema.safeParse({
    files,
    truncated: repositoryTree.truncated === true || entries.length > MAX_TREE_FILES,
  });
  if (!result.success) throw new GitHubRequestError("GitHub returned an invalid repository file list.", 502);
  return result.data;
}

export async function getGitHubRepositoryFile(input: unknown): Promise<GitHubRepositoryFile> {
  const parsed = GitHubRepositoryFileRequestSchema.safeParse(input);
  if (!parsed.success || parsed.data.path.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new GitHubRequestError("Repository file details are invalid.", 400);
  }
  const { owner, repo, sha, path, token } = parsed.data;
  const response = await githubFetch(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(sha)}`,
    token,
  );
  const data = await readJson(response);
  if (!data || typeof data !== "object") throw new GitHubRequestError("GitHub returned an invalid file.", 502);
  const blob = data as Record<string, unknown>;
  if (blob.encoding !== "base64" || typeof blob.content !== "string" || typeof blob.size !== "number") {
    throw new GitHubRequestError("This file is not available as readable text.", 415);
  }
  if (blob.size > MAX_FILE_BYTES) throw new GitHubRequestError("This file is too large to attach. Choose a file under 180 KB.", 413);
  let content: string;
  try {
    const bytes = Buffer.from(blob.content.replace(/\s/g, ""), "base64");
    if (bytes.length > MAX_FILE_BYTES || bytes.includes(0)) {
      throw new Error("Unsupported file contents.");
    }
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new GitHubRequestError("This file is binary or is not valid UTF-8 text.", 415);
  }
  const result = GitHubRepositoryFileSchema.safeParse({ path, size: blob.size, content });
  if (!result.success) throw new GitHubRequestError("GitHub returned invalid file contents.", 502);
  return result.data;
}

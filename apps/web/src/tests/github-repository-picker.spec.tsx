// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectGitHubRepository: vi.fn(),
  getGitHubRepositoryTree: vi.fn(),
  getGitHubRepositoryFile: vi.fn(),
}));

vi.mock("../api", () => mocks);

import { GitHubRepositoryPicker } from "../components/GitHubRepositoryPicker";

const repository = {
  owner: "owner",
  name: "repo",
  fullName: "owner/repo",
  defaultBranch: "main",
};
const tree = {
  files: [
    { path: "src/index.ts", sha: "a".repeat(40), size: 25 },
    { path: "README.md", sha: "b".repeat(40), size: 12 },
  ],
  truncated: false,
};

beforeEach(() => {
  mocks.connectGitHubRepository.mockReset().mockResolvedValue(repository);
  mocks.getGitHubRepositoryTree.mockReset().mockResolvedValue(tree);
  mocks.getGitHubRepositoryFile.mockReset().mockImplementation(async (
    _repository: typeof repository,
    file: { path: string },
  ) => ({
    path: file.path,
    size: 25,
    content: `contents of ${file.path}`,
  }));
});

afterEach(() => cleanup());

describe("GitHub repository picker", () => {
  it("connects, lets the user choose files, and attaches their contents without saving the token", async () => {
    const user = userEvent.setup();
    const onAttach = vi.fn();
    render(<GitHubRepositoryPicker onAttach={onAttach} />);

    await user.click(screen.getByRole("button", { name: "GitHub repository" }));
    fireEvent.change(screen.getByLabelText("Repository URL"), { target: { value: "https://github.com/owner/repo" } });
    fireEvent.change(screen.getByLabelText(/Fine-grained access token/), { target: { value: "github_pat_one_time_token" } });
    await user.click(screen.getByRole("button", { name: "Connect" }));

    expect(await screen.findByText("owner/repo")).toBeTruthy();
    expect(mocks.connectGitHubRepository).toHaveBeenCalledWith(
      "https://github.com/owner/repo",
      "github_pat_one_time_token",
      expect.any(AbortSignal),
    );
    expect(mocks.getGitHubRepositoryTree).toHaveBeenCalledWith(
      repository,
      "github_pat_one_time_token",
      expect.any(AbortSignal),
    );

    await user.click(screen.getByRole("checkbox", { name: /src\/index\.ts/ }));
    await user.click(screen.getByRole("button", { name: "Add 1 file to chat" }));

    await waitFor(() => expect(onAttach).toHaveBeenCalledWith([{
      name: "src/index.ts",
      size: 25,
      type: "text/plain",
      content: "contents of src/index.ts",
    }]));
    expect(mocks.getGitHubRepositoryFile).toHaveBeenCalledWith(
      repository,
      tree.files[0],
      "github_pat_one_time_token",
      expect.any(AbortSignal),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  }, 15_000);

  it("surfaces GitHub errors and does not attach partial repository files", async () => {
    const user = userEvent.setup();
    const onAttach = vi.fn();
    mocks.getGitHubRepositoryFile.mockRejectedValueOnce(new Error("This file is binary."));
    render(<GitHubRepositoryPicker onAttach={onAttach} />);

    await user.click(screen.getByRole("button", { name: "GitHub repository" }));
    fireEvent.change(screen.getByLabelText("Repository URL"), { target: { value: "https://github.com/owner/repo" } });
    await user.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByText("owner/repo");
    await user.click(screen.getByRole("checkbox", { name: /src\/index\.ts/ }));
    await user.click(screen.getByRole("button", { name: "Add 1 file to chat" }));

    expect((await screen.findByRole("alert")).textContent).toContain("This file is binary.");
    expect(onAttach).not.toHaveBeenCalled();
  });
});

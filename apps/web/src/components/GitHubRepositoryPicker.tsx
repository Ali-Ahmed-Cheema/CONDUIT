import { useCallback, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { GitBranch, Github, Search } from "lucide-react";
import { GlassDialog } from "@conduit/ui";
import { MAX_CHAT_HISTORY_CHARACTERS } from "@conduit/core";
import type { ChatAttachment, GitHubRepository, GitHubRepositoryTree } from "@conduit/core";
import {
  connectGitHubRepository,
  getGitHubRepositoryFile,
  getGitHubRepositoryTree,
} from "../api";
import "./GitHubRepositoryPicker.css";

type Props = {
  disabled?: boolean;
  onAttach: (files: ChatAttachment[]) => void;
};

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

export function GitHubRepositoryPicker({ disabled = false, onAttach }: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [repository, setRepository] = useState<GitHubRepository | null>(null);
  const [tree, setTree] = useState<GitHubRepositoryTree | null>(null);
  const [search, setSearch] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestController = useRef<AbortController | null>(null);

  const visibleFiles = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (tree?.files ?? []).filter((file) => !query || file.path.toLocaleLowerCase().includes(query));
  }, [search, tree]);

  const close = useCallback(() => {
    requestController.current?.abort();
    requestController.current = null;
    setOpen(false);
    setUrl("");
    setToken("");
    setRepository(null);
    setTree(null);
    setSelectedPaths([]);
    setSearch("");
    setError("");
    setBusy(false);
  }, []);

  const connect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const controller = new AbortController();
    requestController.current = controller;
    try {
      const connected = await connectGitHubRepository(url, token, controller.signal);
      const repositoryTree = await getGitHubRepositoryTree(connected, token, controller.signal);
      if (controller.signal.aborted) return;
      setRepository(connected);
      setTree(repositoryTree);
      setSelectedPaths([]);
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "Could not connect to this GitHub repository.");
      }
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        setBusy(false);
      }
    }
  };

  const toggleFile = (path: string) => {
    setSelectedPaths((current) => current.includes(path)
      ? current.filter((selected) => selected !== path)
      : current.length < 10 ? [...current, path] : current);
  };

  const attachFiles = async () => {
    if (!repository || !tree || selectedPaths.length === 0) return;
    setBusy(true);
    setError("");
    const controller = new AbortController();
    requestController.current = controller;
    try {
      const files = await Promise.all(selectedPaths.map(async (path) => {
        const entry = tree.files.find((candidate) => candidate.path === path);
        if (!entry) throw new Error(`Could not find ${path} in the connected repository.`);
        const file = await getGitHubRepositoryFile(repository, entry, token, controller.signal);
        return {
          name: file.path,
          size: file.size,
          type: "text/plain",
          content: file.content,
        };
      }));
      const characterCount = files.reduce((total, file) => total + file.content.length, 0);
      if (characterCount > MAX_CHAT_HISTORY_CHARACTERS) {
        throw new Error("The selected repository files exceed the chat text limit. Choose fewer or smaller files.");
      }
      if (controller.signal.aborted) return;
      onAttach(files);
      close();
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "Could not load the selected GitHub files.");
      }
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        setBusy(false);
      }
    }
  };

  return (
    <>
      <button
        type="button"
        className="github-repository-trigger"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <Github size={18} aria-hidden="true" />
        <span>GitHub repository</span>
      </button>
      <GlassDialog open={open} title="Connect a GitHub repository" onClose={close}>
        <div className="github-repository-picker">
          {!repository ? (
            <form onSubmit={(event) => void connect(event)}>
              <p>Browse a repository and attach selected text files to your next message.</p>
              <label>
                Repository URL
                <input
                  type="text"
                  inputMode="url"
                  placeholder="https://github.com/owner/repository"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  required
                  disabled={busy}
                />
              </label>
              <label>
                Fine-grained access token <span>(optional)</span>
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="Required only for private repositories"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  disabled={busy}
                />
              </label>
              <p className="github-repository-note">
                Use a fine-grained token limited to this repository with Contents read-only access.
                The token is used only for these requests and is never saved.
              </p>
              {error && <p className="error-alert" role="alert">{error}</p>}
              <div className="github-repository-actions">
                <button type="button" className="secondary-button" onClick={close} disabled={busy}>Cancel</button>
                <button type="submit" className="primary-button" disabled={busy || !url.trim()}>
                  {busy ? "Connecting…" : "Connect"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="github-repository-heading">
                <div>
                  <strong>{repository.fullName}</strong>
                  <span><GitBranch size={15} aria-hidden="true" /> {repository.defaultBranch}</span>
                </div>
                <button type="button" className="secondary-button" onClick={() => {
                  setRepository(null);
                  setTree(null);
                  setSelectedPaths([]);
                  setError("");
                }} disabled={busy}>
                  Change repository
                </button>
              </div>
              <label className="github-repository-search">
                <Search size={18} aria-hidden="true" />
                <span className="sr-only">Filter repository files</span>
                <input
                  type="search"
                  aria-label="Filter repository files"
                  placeholder="Find a file"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  disabled={busy}
                />
              </label>
              {tree?.truncated && (
                <p className="github-repository-note" role="status">
                  Showing the first 2,500 text and source file entries from this repository.
                </p>
              )}
              <p className="github-repository-count" aria-live="polite">
                {selectedPaths.length}/10 selected · {visibleFiles.length} files shown
              </p>
              <div className="github-repository-files" role="group" aria-label="Repository files">
                {visibleFiles.length ? visibleFiles.map((file) => {
                  const selected = selectedPaths.includes(file.path);
                  const tooLarge = file.size > MAX_CHAT_HISTORY_CHARACTERS;
                  return (
                    <label className="github-repository-file" key={file.path}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleFile(file.path)}
                        disabled={busy || tooLarge || (!selected && selectedPaths.length >= 10)}
                      />
                      <span>{file.path}</span>
                      <small>{tooLarge ? "Too large" : formatSize(file.size)}</small>
                    </label>
                  );
                }) : <p className="github-repository-empty">No files match that search.</p>}
              </div>
              <p className="github-repository-note">
                Selected contents will be included in the chat sent to your configured AI provider.
              </p>
              {error && <p className="error-alert" role="alert">{error}</p>}
              <div className="github-repository-actions">
                <button type="button" className="secondary-button" onClick={close} disabled={busy}>Cancel</button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void attachFiles()}
                  disabled={busy || selectedPaths.length === 0}
                >
                  {busy ? "Loading files…" : `Add ${selectedPaths.length} ${selectedPaths.length === 1 ? "file" : "files"} to chat`}
                </button>
              </div>
            </>
          )}
        </div>
      </GlassDialog>
    </>
  );
}

import { useMemo, useState } from "react";
import { BookOpen, Check, Copy, Search } from "lucide-react";
import { GlassButton, GlassDialog } from "@conduit/ui";
import { promptCategories, promptTemplates, type PromptCategory } from "../lib/promptLibrary";
import "./PromptLibrary.css";

export function PromptLibrary() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<PromptCategory | "All">("All");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState("");

  const filteredPrompts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return promptTemplates.filter((template) => {
      const matchesCategory = category === "All" || template.category === category;
      const matchesQuery = !normalizedQuery || [template.title, template.category, template.prompt]
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  const copyPrompt = async (id: string, prompt: string) => {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedId(id);
    } catch (reason) {
      setCopyError(reason instanceof Error
        ? `Could not copy this prompt: ${reason.message}`
        : "Could not copy this prompt. Check clipboard permissions and try again.");
    }
  };

  const closeLibrary = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        className="prompt-library-trigger"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <BookOpen size={20} />Prompt library
      </button>
      <GlassDialog open={open} title="Prompt library" onClose={closeLibrary}>
        <div className="prompt-library">
          <p>Browse 50 ready-to-use starters. Copy one, fill in its bracketed details, and paste it into your chat.</p>
          <label className="prompt-library-search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search prompts</span>
            <input
              type="search"
              aria-label="Search prompts"
              placeholder="Search by topic or prompt"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCopiedId(null);
                setCopyError("");
              }}
            />
          </label>
          <div className="prompt-library-categories" role="group" aria-label="Filter prompts by category">
            <button type="button" aria-pressed={category === "All"} onClick={() => setCategory("All")}>
              All ({promptTemplates.length})
            </button>
            {promptCategories.map((item) => (
              <button
                type="button"
                key={item}
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <p className="prompt-library-count" aria-live="polite">
            {filteredPrompts.length} {filteredPrompts.length === 1 ? "prompt" : "prompts"}
          </p>
          {copyError && <p className="error-alert" role="alert">{copyError}</p>}
          <div className="prompt-library-list">
            {filteredPrompts.length ? filteredPrompts.map((template) => (
              <article className="prompt-library-card" key={template.id}>
                <div>
                  <span className="prompt-library-category">{template.category}</span>
                  <h3>{template.title}</h3>
                  <p>{template.prompt}</p>
                </div>
                <GlassButton
                  type="button"
                  aria-label={`${copiedId === template.id ? "Copied" : "Copy"} prompt: ${template.title}`}
                  onClick={() => void copyPrompt(template.id, template.prompt)}
                >
                  {copiedId === template.id ? <Check size={18} /> : <Copy size={18} />}
                  {copiedId === template.id ? "Copied" : "Copy prompt"}
                </GlassButton>
              </article>
            )) : (
              <p className="prompt-library-empty">No prompts match those filters. Try another search or category.</p>
            )}
          </div>
          <div className="prompt-library-footer">
            {copiedId && <span role="status">Prompt copied. Paste it into your chat when you’re ready.</span>}
            <GlassButton type="button" variant="primary" onClick={closeLibrary}>Done</GlassButton>
          </div>
        </div>
      </GlassDialog>
    </>
  );
}

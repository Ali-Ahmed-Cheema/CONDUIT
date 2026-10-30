import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

function getTextContent(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") return String(child);
      if (isValidElement<{ children?: ReactNode }>(child)) return getTextContent(child.props.children);
      return "";
    })
    .join("");
}

export function formatTableAsTsv(rows: Iterable<Iterable<string>>): string {
  return Array.from(rows, (row) =>
    Array.from(row, (cell) => cell.replace(/\s+/g, " ").trim()).join("\t"),
  ).join("\n");
}

function CopyCodeButton({
  code,
  label = "code",
  onCopyError,
}: {
  code: string | (() => string);
  label?: string;
  onCopyError: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(typeof code === "function" ? code() : code);
      setCopied(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      onCopyError();
    }
  };

  return (
    <button
      type="button"
      className="code-copy-button"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={copied ? "Copied" : `Copy ${label}`}
      onClick={() => void copy()}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function TableWithCopy({ children, onCopyError }: { children: ReactNode; onCopyError: () => void }) {
  const tableRef = useRef<HTMLTableElement>(null);

  const copyTable = () => {
    const table = tableRef.current;
    if (!table) throw new Error("The table is not available to copy.");
    return formatTableAsTsv(
      Array.from(table.rows, (row) => Array.from(row.cells, (cell) => cell.innerText || cell.textContent || "")),
    );
  };

  return (
    <div className="table-block">
      <div className="table-toolbar">
        <span>Table</span>
        <CopyCodeButton code={copyTable} label="table" onCopyError={onCopyError} />
      </div>
      <div className="table-scroll">
        <table ref={tableRef}>{children}</table>
      </div>
    </div>
  );
}

export function MarkdownContent({ content, onCopyError }: { content: string; onCopyError: () => void }) {
  const components: Components = {
    table({ children }) {
      return <TableWithCopy onCopyError={onCopyError}>{children}</TableWithCopy>;
    },
    pre({ children }) {
      const codeElement = Children.toArray(children).find((child) =>
        isValidElement<{ className?: string; children?: ReactNode }>(child),
      );
      const codeProps = isValidElement<{ className?: string; children?: ReactNode }>(codeElement)
        ? codeElement.props
        : null;
      const code = getTextContent(codeProps?.children ?? children);
      const language = codeProps?.className?.match(/language-([^\s]+)/)?.[1];

      return (
        <div className="code-block">
          <div className="code-toolbar">
            <span>{language ?? "Code"}</span>
            <CopyCodeButton code={code} onCopyError={onCopyError} />
          </div>
          <pre><code className={codeProps?.className}>{codeProps?.children ?? children}</code></pre>
        </div>
      );
    },
    code({ children, className }) {
      if (className) return <code className={className}>{children}</code>;

      const code = getTextContent(children);
      return (
        <span className="inline-code-wrap">
          <code>{children}</code>
          {code && <CopyCodeButton code={code} onCopyError={onCopyError} />}
        </span>
      );
    },
  };

  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

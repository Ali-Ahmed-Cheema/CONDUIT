import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, Download } from "lucide-react";
import {
  createGeneratedFilesZip,
  downloadGeneratedFile,
  extractGeneratedCodeFiles,
  generatedFileNameForCode,
  type GeneratedCodeFile,
} from "../lib/generatedFiles";
import { CodePreview } from "./CodePreview";

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

export function MarkdownContent({
  content,
  onCopyError,
}: {
  content: string;
  onCopyError: () => void;
}) {
  const [downloadFailed, setDownloadFailed] = useState(false);
  const generatedFiles = extractGeneratedCodeFiles(content);
  const hasProjectFiles = generatedFiles.length > 1 || generatedFiles.some((file) => file.name.includes("/"));
  const renderedFiles: GeneratedCodeFile[] = [];
  const usedNames = new Set<string>();
  let renderedCodeBlockIndex = 0;
  const downloadFile = (file: Blob, name: string) => {
    try {
      downloadGeneratedFile(file, name);
    } catch {
      setDownloadFailed(true);
    }
  };
  const components: Components = {
    a({ href, children, node: _node, ...props }) {
      return (
        <a {...props} href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    table({ children }) {
      return <TableWithCopy onCopyError={onCopyError}>{children}</TableWithCopy>;
    },
    pre({ children }) {
      const fileIndex = renderedCodeBlockIndex;
      renderedCodeBlockIndex += 1;
      const codeElement = Children.toArray(children).find((child) =>
        isValidElement<{ className?: string; children?: ReactNode }>(child),
      );
      const codeProps = isValidElement<{ className?: string; children?: ReactNode }>(codeElement)
        ? codeElement.props
        : null;
      const code = getTextContent(codeProps?.children ?? children);
      const language = codeProps?.className?.match(/language-([^\s]+)/)?.[1];
      const generatedFile = generatedFiles[fileIndex];
      let fileName = generatedFileNameForCode(language, generatedFile?.name);
      if (usedNames.has(fileName.toLowerCase())) {
        const lastDot = fileName.lastIndexOf(".");
        const stem = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
        const extension = lastDot > 0 ? fileName.slice(lastDot) : "";
        let suffix = 2;
        while (usedNames.has(`${stem}-${suffix}${extension}`.toLowerCase())) suffix += 1;
        fileName = `${stem}-${suffix}${extension}`;
      }
      usedNames.add(fileName.toLowerCase());
      renderedFiles.push({ name: fileName, content: code });

      return (
        <div className="code-block">
          <div className="code-toolbar">
            <span>{language ?? "Code"}</span>
            <div className="code-toolbar-actions">
              <CodePreview code={code} language={language} />
              <CopyCodeButton code={code} onCopyError={onCopyError} />
              <button
                type="button"
                className="code-copy-button"
                aria-label={`Download ${fileName}`}
                title={`Download ${fileName}`}
                onClick={() => downloadFile(new Blob([code], { type: "text/plain;charset=utf-8" }), fileName)}
              >
                <Download size={14} />
              </button>
              {fileIndex === 0 && hasProjectFiles && (
                <button
                  type="button"
                  className="code-copy-button"
                  aria-label="Download project as ZIP"
                  title="Download project as ZIP"
                  onClick={async () => {
                    try {
                      const zip = await createGeneratedFilesZip(renderedFiles);
                      const archive = new ArrayBuffer(zip.byteLength);
                      new Uint8Array(archive).set(zip);
                      downloadGeneratedFile(
                        new Blob([archive], { type: "application/zip" }),
                        "generated-project.zip",
                      );
                    } catch {
                      setDownloadFailed(true);
                    }
                  }}
                >
                  <Download size={14} />
                  <span className="visually-hidden">ZIP</span>
                </button>
              )}
            </div>
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
      {downloadFailed && <p role="alert">Could not download the generated file.</p>}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

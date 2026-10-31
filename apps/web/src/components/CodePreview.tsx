import { useState } from "react";
import { Eye, Play } from "lucide-react";

type CodeAction = "run" | "preview";

const previewPolicy =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
const executionPolicy =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";

function actionForLanguage(language: string | undefined): CodeAction | null {
  const normalized = language?.toLowerCase().replace(/^language-/, "");
  if (normalized === "js" || normalized === "javascript") return "run";
  if (normalized === "html" || normalized === "htm" || normalized === "css") return "preview";
  return null;
}

export function createCodePreviewDocument(code: string, language: string | undefined, action: CodeAction): string {
  const normalized = language?.toLowerCase().replace(/^language-/, "");
  const policyValue = action === "run" ? executionPolicy : previewPolicy;
  const policy = `<meta http-equiv="Content-Security-Policy" content="${policyValue}">`;
  const baseStyle = "<style>body{font:16px system-ui,sans-serif;margin:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>";

  if (action === "run") {
    return `<!doctype html><meta charset="utf-8">${policy}${baseStyle}<pre id="output">Program finished with no output.</pre><script>
const output = document.getElementById("output");
const format = (value) => {
  if (value instanceof Error) return value.name + ": " + value.message;
  if (typeof value === "string") return value;
  try { const result = JSON.stringify(value); return result === undefined ? String(value) : result; }
  catch { return String(value); }
};
const write = (...values) => {
  if (output.textContent === "Program finished with no output.") output.textContent = "";
  output.textContent += values.map(format).join(" ") + "\\n";
};
console.log = write;
console.info = write;
console.warn = write;
console.error = write;
window.addEventListener("error", (event) => write("Error:", event.message));
window.addEventListener("unhandledrejection", (event) => write("Error:", event.reason));
</script><script>
(async () => {
  try {
${code}
  } catch (error) {
    console.error(error);
  }
})();
</script>`;
  }

  const html = normalized === "css"
    ? `<style>${code.replace(/<\/style/gi, "\\3c /style")}</style><main><h1>CSS preview</h1><p>Your stylesheet is applied to this sample content.</p><button type="button">Example button</button></main>`
    : code;

  return `<!doctype html><meta charset="utf-8">${policy}${baseStyle}${html}`;
}

export function CodePreview({ code, language }: { code: string; language?: string }) {
  const action = actionForLanguage(language);
  const [visible, setVisible] = useState(false);
  const [runCount, setRunCount] = useState(0);

  if (!action) return null;

  const run = () => {
    setRunCount((count) => count + 1);
    setVisible(true);
  };
  const togglePreview = () => setVisible((current) => !current);
  const normalized = language?.toLowerCase().replace(/^language-/, "");
  const title = action === "run" ? "JavaScript output" : `${normalized?.toUpperCase()} preview`;

  return (
    <>
      <button
        type="button"
        className="code-action-button"
        aria-label={action === "run" ? "Run JavaScript code" : `Preview ${normalized?.toUpperCase()} code`}
        aria-expanded={visible}
        onClick={action === "run" ? run : togglePreview}
      >
        {action === "run" ? <Play size={14} /> : <Eye size={14} />}
        {action === "run" ? "Run" : visible ? "Hide preview" : "Preview"}
      </button>
      {visible && (
        <div className="code-preview-panel">
          <iframe
            key={action === "run" ? runCount : "preview"}
            title={title}
            sandbox={action === "run" ? "allow-scripts" : ""}
            referrerPolicy="no-referrer"
            srcDoc={createCodePreviewDocument(code, language, action)}
          />
        </div>
      )}
    </>
  );
}

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatTableAsTsv, MarkdownContent } from "../components/MarkdownContent";
import { CodePreview, createCodePreviewDocument } from "../components/CodePreview";

describe("chat Markdown rendering", () => {
  it("renders common text formatting and tables", () => {
    const markup = renderToStaticMarkup(
      createElement(MarkdownContent, {
        content: "**bold**, *italic*, ~~removed~~\n\n| Name |\n| --- |\n| Chat |",
        onCopyError: () => {},
      }),
    );

    expect(markup).toContain("<strong>bold</strong>");
    expect(markup).toContain("<em>italic</em>");
    expect(markup).toContain("<del>removed</del>");
    expect(markup).toContain("<table>");
    expect(markup).toContain('aria-label="Copy table"');
  });

  it("formats copied table rows as spreadsheet-friendly tab-separated text", () => {
    expect(formatTableAsTsv([
      ["Name", "Details"],
      ["  Chat\nAssistant ", "Markdown\tready"],
    ])).toBe("Name\tDetails\nChat Assistant\tMarkdown ready");
  });

  it("renders fenced code with a language label and a separate copy control", () => {
    const markup = renderToStaticMarkup(
      createElement(MarkdownContent, {
        content: "```typescript\nconst answer = 42;\n```",
        onCopyError: () => {},
      }),
    );

    expect(markup).toContain("<span>typescript</span>");
    expect(markup).toContain("const answer = 42;");
    expect(markup).toContain('aria-label="Copy code"');
    expect(markup).toContain('aria-label="Download generated.ts"');
  });

  it("adds a Run action for JavaScript and preview actions for HTML and CSS", () => {
    const javascript = renderToStaticMarkup(
      createElement(CodePreview, { code: 'console.log("Hello world");', language: "javascript" }),
    );
    const html = renderToStaticMarkup(
      createElement(CodePreview, { code: "<h1>Hello</h1>", language: "html" }),
    );
    const css = renderToStaticMarkup(
      createElement(CodePreview, { code: "h1 { color: red; }", language: "css" }),
    );

    expect(javascript).toContain('aria-label="Run JavaScript code"');
    expect(html).toContain('aria-label="Preview HTML code"');
    expect(css).toContain('aria-label="Preview CSS code"');
  });

  it("prepares JavaScript output and blocks network access", () => {
    const document = createCodePreviewDocument('console.log("Hello world");', "javascript", "run");

    expect(document).toContain('id="output"');
    expect(document).toContain('console.log("Hello world");');
    expect(document).toContain("connect-src 'none'");
    expect(document).toContain('.join(" ") + "\\n"');
  });

  it("renders HTML previews without enabling scripts or network access", () => {
    const document = createCodePreviewDocument("<h1>Hello</h1>", "html", "preview");

    expect(document).toContain("<h1>Hello</h1>");
    expect(document).toContain("script-src 'none'");
    expect(document).toContain("connect-src 'none'");
  });

  it("does not offer an action for languages without a local runtime", () => {
    expect(renderToStaticMarkup(
      createElement(CodePreview, { code: 'print("Hello world")', language: "python" }),
    )).toBe("");
  });

  it("offers a ZIP download for multi-file project responses", () => {
    const markup = renderToStaticMarkup(
      createElement(MarkdownContent, {
        content: "```cpp filename=\"src/main.cpp\"\nint main() {}\n```\n\n```json filename=\"config/app.json\"\n{}\n```",
        onCopyError: () => {},
      }),
    );

    expect(markup).toContain('aria-label="Download src/main.cpp"');
    expect(markup).toContain('aria-label="Download project as ZIP"');
  });

  it("adds a separate copy control to inline code", () => {
    const markup = renderToStaticMarkup(
      createElement(MarkdownContent, {
        content: "Run `npm test` to verify.",
        onCopyError: () => {},
      }),
    );

    expect(markup).toContain("<code>npm test</code>");
    expect(markup).toContain('aria-label="Copy code"');
  });

  it("opens markdown links in a new tab", () => {
    const markup = renderToStaticMarkup(
      createElement(MarkdownContent, {
        content: "[Open docs](https://example.com/docs)",
        onCopyError: () => {},
      }),
    );

    expect(markup).toContain('<a href="https://example.com/docs" target="_blank" rel="noopener noreferrer">');
    expect(markup).toContain("Open docs");
  });
});

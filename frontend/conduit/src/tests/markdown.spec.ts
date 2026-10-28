import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatTableAsTsv, MarkdownContent } from "../components/MarkdownContent";

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
});

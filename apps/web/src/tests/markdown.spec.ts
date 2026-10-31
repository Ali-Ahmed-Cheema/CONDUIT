// @vitest-environment jsdom

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatTableAsTsv, MarkdownContent } from "../components/MarkdownContent";
import { CodePreview, createCodePreviewDocument } from "../components/CodePreview";
import { extractGeneratedCodeFiles } from "../lib/generatedFiles";

afterEach(cleanup);

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

  it("renders a GenUI calculator and updates its result as inputs change", async () => {
    const user = userEvent.setup();
    const content = [
      "Adjust your marks to calculate your percentage.",
      "",
      "```genui",
      JSON.stringify({
        type: "calculator",
        title: "Student Grade Calculator",
        fields: [
          { name: "obtained", label: "Obtained marks", type: "number", value: 85, min: 0, max: 150 },
          { name: "total", label: "Total marks", type: "range", value: 100, min: 1, max: 150 },
        ],
        calculation: { label: "Percentage", numerator: "obtained", denominator: "total", decimals: 2 },
      }),
      "```",
    ].join("\n");
    render(createElement(MarkdownContent, { content, onCopyError: () => {} }));

    expect(screen.getByText("85.00%")).toBeTruthy();
    await user.clear(screen.getByRole("spinbutton", { name: "Obtained marks" }));
    await user.type(screen.getByRole("spinbutton", { name: "Obtained marks" }), "90");
    expect(screen.getByText("90.00%")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download genui" })).toBeNull();
  });

  it("submits generated form values as a follow-up chat action", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const content = `\`\`\`genui
${JSON.stringify({
  type: "form",
  title: "Trip planner",
  fields: [
    { name: "destination", label: "Destination", type: "text", value: "Paris" },
    { name: "days", label: "Days", type: "number", value: 3 },
  ],
  submitLabel: "Plan my trip",
})}
\`\`\``;
    render(createElement(MarkdownContent, { content, onCopyError: () => {}, onAction }));

    await user.click(screen.getByRole("button", { name: "Plan my trip" }));
    expect(onAction).toHaveBeenCalledWith("Use these form values for Trip planner:\nDestination: Paris\nDays: 3");
    expect(screen.getByRole("status").textContent).toBe("Sent to the conversation.");
  });

  it("renders generated charts and tables and wires action buttons to chat", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const content = `\`\`\`genui
${JSON.stringify({
  type: "ui",
  components: [
    { type: "chart", title: "Quarterly revenue", labels: ["Q1", "Q2"], values: [12, 18] },
    { type: "table", title: "Top regions", columns: ["Region", "Sales"], rows: [["North", 18]] },
    { type: "button", label: "Explain the chart", prompt: "Explain this chart in detail." },
  ],
})}
\`\`\``;
    render(createElement(MarkdownContent, { content, onCopyError: () => {}, onAction }));

    expect(screen.getByRole("img", { name: "Quarterly revenue" })).toBeTruthy();
    expect(screen.getByRole("table").textContent).toContain("North");
    await user.click(screen.getByRole("button", { name: "Explain the chart" }));
    expect(onAction).toHaveBeenCalledWith("Explain this chart in detail.");
  });

  it("does not execute unsupported GenUI content or treat it as a generated file", () => {
    const content = `\`\`\`genui
{"type":"script","code":"alert(1)"}
\`\`\`

\`\`\`typescript
const answer = 42;
\`\`\``;
    const { container } = render(createElement(MarkdownContent, { content, onCopyError: () => {} }));

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelectorAll(".code-block")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Download genui" })).toBeNull();
    expect(extractGeneratedCodeFiles(content)).toEqual([
      { name: "generated.ts", content: "const answer = 42;\n" },
    ]);
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

  it("opens HTML and CSS previews from their code blocks", async () => {
    render(createElement(MarkdownContent, {
      content: "```javascript\nconsole.log('Hello');\n```\n\n```html\n<h1>Hello</h1>\n```\n\n```css\nh1 { color: red; }\n```",
      onCopyError: () => {},
    }));

    await screen.getByRole("button", { name: "Run JavaScript code" }).click();
    expect(screen.getByTitle("JavaScript output").getAttribute("srcdoc")).toContain("console.log('Hello');");

    await screen.getByRole("button", { name: "Preview HTML code" }).click();
    expect(screen.getByTitle("HTML preview").getAttribute("srcdoc")).toContain("<h1>Hello</h1>");

    await screen.getByRole("button", { name: "Preview CSS code" }).click();
    expect(screen.getByTitle("CSS preview").getAttribute("srcdoc")).toContain("h1 { color: red; }");
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

  it("downloads the exact rendered code using its language extension", async () => {
    const markdown = '```csharp filename="ApiResponse.txt"\npublic class ApiResponse {}\n\n```';
    const blobs: Blob[] = [];
    const downloads: string[] = [];
    const previousCreateObjectURL = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        blobs.push(blob);
        return "blob:generated";
      }),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });

    try {
      const { container } = render(createElement(MarkdownContent, { content: markdown, onCopyError: () => {} }));
      await screen.getByRole("button", { name: "Download ApiResponse.cs" }).click();

      expect(downloads).toEqual(["ApiResponse.cs"]);
      expect(await blobs[0]?.text()).toBe(container.querySelector(".code-block pre code")?.textContent);
    } finally {
      click.mockRestore();
      if (previousCreateObjectURL) {
        Object.defineProperty(URL, "createObjectURL", previousCreateObjectURL);
      } else {
        Reflect.deleteProperty(URL, "createObjectURL");
      }
    }
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

import { describe, expect, it } from "vitest";
import { CitationSchema, DocumentChunkSchema } from "./index";

describe("retrieval boundary contracts", () => {
  it("validates indexed document chunks", () => {
    expect(DocumentChunkSchema.safeParse({
      id: "chunk-1",
      documentId: "doc-1",
      ordinal: 0,
      content: "Local content",
      metadata: { source: "notes.md" },
    }).success).toBe(true);
    expect(DocumentChunkSchema.safeParse({
      id: "",
      documentId: "doc-1",
      ordinal: 0,
      content: "Local content",
      metadata: {},
    }).success).toBe(false);
  });

  it("requires nonnegative citation offsets", () => {
    expect(CitationSchema.safeParse({
      documentId: "doc-1",
      chunkId: "chunk-1",
      startOffset: 2,
      endOffset: 9,
    }).success).toBe(true);
    expect(CitationSchema.safeParse({
      documentId: "doc-1",
      chunkId: "chunk-1",
      startOffset: -1,
      endOffset: 9,
    }).success).toBe(false);
    expect(CitationSchema.safeParse({
      documentId: "doc-1",
      chunkId: "chunk-1",
      startOffset: 9,
      endOffset: 9,
    }).success).toBe(false);
  });
});

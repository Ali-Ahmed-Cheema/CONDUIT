import { z } from "zod";

export const DocumentChunkSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  ordinal: z.number().int().nonnegative(),
  content: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()),
});

export const CitationSchema = z.object({
  documentId: z.string().min(1),
  chunkId: z.string().min(1),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
}).refine((value) => value.endOffset > value.startOffset, {
  path: ["endOffset"],
  message: "Citation end offset must be after its start offset.",
});

export type DocumentChunk = z.infer<typeof DocumentChunkSchema>;
export type Citation = z.infer<typeof CitationSchema>;

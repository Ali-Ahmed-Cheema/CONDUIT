import { beforeEach, describe, expect, it, vi } from "vitest";
import { convertFileToText } from "../lib/attachmentText";

const mocks = vi.hoisted(() => ({
  createWorker: vi.fn(),
}));

vi.mock("tesseract.js", () => ({
  createWorker: mocks.createWorker,
}));

describe("file-to-text conversion", () => {
  beforeEach(() => {
    mocks.createWorker.mockReset();
  });

  it("preserves text file contents", async () => {
    const file = new File(["# Project notes\nAll formats are converted before sending."], "Pasted text #1.txt", {
      type: "text/plain",
    });

    await expect(convertFileToText(file)).resolves.toBe("# Project notes\nAll formats are converted before sending.");
  });

  it("decodes UTF-16 text files", async () => {
    const file = new File([new Uint8Array([0xff, 0xfe, 0x4e, 0x00, 0x6f, 0x00])], "notes.txt", {
      type: "text/plain",
    });

    await expect(convertFileToText(file)).resolves.toBe("No");
  });

  it("converts binary files of any extension to lossless base64 text", async () => {
    const file = new File([new Uint8Array([0x00, 0x7f, 0xff])], "unknown-format.dat", {
      type: "application/octet-stream",
    });

    await expect(convertFileToText(file)).resolves.toBe([
      "Binary file converted to base64 text.",
      "Original file: unknown-format.dat",
      "MIME type: application/octet-stream",
      "Encoding: base64",
      "",
      "AH//",
    ].join("\n"));
  });

  it("uses browser OCR for image files and returns extracted text", async () => {
    const image = new File(["image data"], "photo.png", { type: "image/png" });
    const recognize = vi.fn().mockResolvedValue({ data: { text: "  Words in the photo  " } });
    const terminate = vi.fn().mockResolvedValue(undefined);
    mocks.createWorker.mockResolvedValue({ recognize, terminate });

    await expect(convertFileToText(image)).resolves.toBe("OCR text (English):\nWords in the photo");
    expect(mocks.createWorker).toHaveBeenCalledWith(
      "eng",
      undefined,
      expect.objectContaining({
        workerPath: "/ocr-assets/worker.min.js",
        corePath: "/ocr-assets",
        workerBlobURL: false,
      }),
    );
    expect(recognize).toHaveBeenCalledWith(image);
    expect(terminate).toHaveBeenCalledOnce();
  });

  it("reports images with no readable text instead of sending image data as base64", async () => {
    const image = new File(["image data"], "blank.png", { type: "image/png" });
    const terminate = vi.fn().mockResolvedValue(undefined);
    mocks.createWorker.mockResolvedValue({
      recognize: vi.fn().mockResolvedValue({ data: { text: "  " } }),
      terminate,
    });

    await expect(convertFileToText(image)).rejects.toThrow("No readable text was found in blank.png.");
    expect(terminate).toHaveBeenCalledOnce();
  });
});

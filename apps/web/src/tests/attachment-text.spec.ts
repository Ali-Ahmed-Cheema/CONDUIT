// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
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

  it("extracts Word text based on MIME type before sending it as text", async () => {
    const bytes = zipSync({
      "word/document.xml": strToU8(
        '<?xml version="1.0"?><w:document xmlns:w="urn:word"><w:body><w:p><w:r><w:t>First paragraph</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p></w:body></w:document>',
      ),
    });
    const file = new File([bytes], "notes.data", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    await expect(convertFileToText(file)).resolves.toBe(
      "Extracted text (DOCX):\nFirst paragraph\nSecond paragraph",
    );
  });

  it("extracts presentation slides in order", async () => {
    const bytes = zipSync({
      "ppt/slides/slide2.xml": strToU8(
        '<p:sld xmlns:p="urn:presentation" xmlns:a="urn:drawing"><a:p><a:r><a:t>Second slide</a:t></a:r></a:p></p:sld>',
      ),
      "ppt/slides/slide1.xml": strToU8(
        '<p:sld xmlns:p="urn:presentation" xmlns:a="urn:drawing"><a:p><a:r><a:t>First slide</a:t></a:r></a:p></p:sld>',
      ),
    });
    const file = new File([bytes], "slides.pptx");

    await expect(convertFileToText(file)).resolves.toBe(
      "Extracted text (PPTX):\nFirst slide\n\nSecond slide",
    );
  });

  it("extracts spreadsheet cell values, including shared strings", async () => {
    const bytes = zipSync({
      "xl/sharedStrings.xml": strToU8(
        '<sst xmlns="urn:spreadsheet"><si><t>Name</t></si><si><t>CONDUIT</t></si></sst>',
      ),
      "xl/worksheets/sheet1.xml": strToU8(
        '<worksheet xmlns="urn:spreadsheet"><sheetData><row><c t="s"><v>0</v></c><c><v>42</v></c></row><row><c t="s"><v>1</v></c></row></sheetData></worksheet>',
      ),
    });
    const file = new File([bytes], "report.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    await expect(convertFileToText(file)).resolves.toBe("Extracted text (XLSX):\nName\t42\nCONDUIT");
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

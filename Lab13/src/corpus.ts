import path from "node:path";
import { fileURLToPath } from "node:url";

export const corpusFilenames = [
  "sg-refund-policy-current.pdf",
  "au-refund-policy-current.pdf",
  "shipping-investigation-guide.pdf",
  "product-warranty-guide.pdf",
  "support-escalation-guide.pdf",
] as const;

export interface CorpusDocument {
  filename: string;
  key: string;
  sourcePath: string;
}

const defaultPdfDirectory = fileURLToPath(
  new URL("../../documents/pdf-review/pdfs/", import.meta.url),
);

export function getCorpus(pdfDirectory = defaultPdfDirectory): CorpusDocument[] {
  return corpusFilenames.map((filename) => ({
    filename,
    key: `documents/${filename}`,
    sourcePath: path.join(pdfDirectory, filename),
  }));
}

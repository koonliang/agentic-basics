import path from "node:path";
import { fileURLToPath } from "node:url";

import type { DocumentMetadata } from "./types.js";

export interface CorpusDocument extends DocumentMetadata {
  key: string;
  metadataKey: string;
  sourcePath: string;
}

const documentDefinitions: DocumentMetadata[] = [
  document("POL-SG-REF-2026", "sg-refund-policy-current.pdf", "Singapore Refund Policy", "Singapore", "3.2", "current", 20260901),
  document("POL-SG-REF-2025", "sg-refund-policy-superseded.pdf", "Singapore Refund Policy", "Singapore", "2.4", "superseded", 20250115),
  document("POL-AU-REF-2026", "au-refund-policy-current.pdf", "Australia Refund Policy", "Australia", "4.0", "current", 20260701),
  document("OPS-SHIP-2026", "shipping-investigation-guide.pdf", "Shipping Investigation Guide", "Global", "2.1", "current", 20260820),
  document("POL-WAR-2026", "product-warranty-guide.pdf", "Product Warranty Guide", "Global", "1.8", "current", 20260610),
  document("OPS-ESC-2026", "support-escalation-guide.pdf", "Support Escalation Guide", "Global", "3.0", "current", 20260905),
  document("TEST-TABLE-NATIVE", "return-processing-table-native.pdf", "Return Processing Matrix", "Global", "1.0", "fixture", 20260901, "native"),
  document("TEST-TABLE-IMAGE", "return-processing-table-image.pdf", "Return Processing Matrix", "Global", "1.0", "fixture", 20260901, "image"),
];

const defaultPdfDirectory = fileURLToPath(
  new URL("../../documents/pdf-review/pdfs/", import.meta.url),
);

export function getCorpus(pdfDirectory = defaultPdfDirectory): CorpusDocument[] {
  return documentDefinitions.map((item) => ({
    ...item,
    key: `documents/${item.filename}`,
    metadataKey: `documents/${item.filename}.metadata.json`,
    sourcePath: path.join(pdfDirectory, item.filename),
  }));
}

export function buildMetadataSidecar(document: DocumentMetadata): string {
  return JSON.stringify({
    metadataAttributes: {
      document_id: stringAttribute(document.documentId),
      filename: stringAttribute(document.filename),
      title: stringAttribute(document.title),
      region: stringAttribute(document.region),
      version: stringAttribute(document.version),
      status: stringAttribute(document.status),
      representation: stringAttribute(document.representation),
      effective_date: {
        value: { type: "NUMBER", numberValue: document.effectiveDate },
        includeForEmbedding: false,
      },
    },
  });
}

function document(
  documentId: string,
  filename: string,
  title: string,
  region: DocumentMetadata["region"],
  version: string,
  status: DocumentMetadata["status"],
  effectiveDate: number,
  representation: DocumentMetadata["representation"] = "mixed",
): DocumentMetadata {
  return { documentId, filename, title, region, version, status, effectiveDate, representation };
}

function stringAttribute(value: string) {
  return {
    value: { type: "STRING", stringValue: value },
    includeForEmbedding: false,
  } as const;
}

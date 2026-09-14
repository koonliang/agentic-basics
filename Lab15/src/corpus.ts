import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PolicyMetadata } from "./types.js";

export interface CorpusDocument extends PolicyMetadata {
  filename: string;
  key: string;
  metadataKey: string;
  sourcePath: string;
}

const documentDefinitions: Array<PolicyMetadata & { filename: string }> = [
  {
    documentId: "POL-SG-REF-2026",
    filename: "sg-refund-policy-current.pdf",
    title: "Singapore Refund Policy",
    region: "Singapore",
    version: "3.2",
    effectiveDate: 20260901,
    status: "current",
  },
  {
    documentId: "POL-SG-REF-2025",
    filename: "sg-refund-policy-superseded.pdf",
    title: "Singapore Refund Policy",
    region: "Singapore",
    version: "2.4",
    effectiveDate: 20250115,
    status: "superseded",
  },
  {
    documentId: "POL-AU-REF-2026",
    filename: "au-refund-policy-current.pdf",
    title: "Australia Refund Policy",
    region: "Australia",
    version: "4.0",
    effectiveDate: 20260701,
    status: "current",
  },
  {
    documentId: "OPS-SHIP-2026",
    filename: "shipping-investigation-guide.pdf",
    title: "Shipping Investigation Guide",
    region: "Global",
    version: "2.1",
    effectiveDate: 20260820,
    status: "current",
  },
  {
    documentId: "POL-WAR-2026",
    filename: "product-warranty-guide.pdf",
    title: "Product Warranty Guide",
    region: "Global",
    version: "1.8",
    effectiveDate: 20260610,
    status: "current",
  },
  {
    documentId: "OPS-ESC-2026",
    filename: "support-escalation-guide.pdf",
    title: "Support Escalation Guide",
    region: "Global",
    version: "3.0",
    effectiveDate: 20260905,
    status: "current",
  },
];

const defaultPdfDirectory = fileURLToPath(
  new URL("../../documents/pdf-review/pdfs/", import.meta.url),
);

export function getCorpus(pdfDirectory = defaultPdfDirectory): CorpusDocument[] {
  return documentDefinitions.map((document) => ({
    ...document,
    key: `documents/${document.filename}`,
    metadataKey: `documents/${document.filename}.metadata.json`,
    sourcePath: path.join(pdfDirectory, document.filename),
  }));
}

export function buildMetadataSidecar(document: PolicyMetadata): string {
  return JSON.stringify({
    metadataAttributes: {
      document_id: stringAttribute(document.documentId),
      title: stringAttribute(document.title),
      region: stringAttribute(document.region),
      version: stringAttribute(document.version),
      status: stringAttribute(document.status),
      effective_date: {
        value: { type: "NUMBER", numberValue: document.effectiveDate },
        includeForEmbedding: false,
      },
    },
  });
}

function stringAttribute(value: string) {
  return {
    value: { type: "STRING", stringValue: value },
    includeForEmbedding: false,
  } as const;
}

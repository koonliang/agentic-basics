import type { KnowledgeBaseRetrievalResult } from "@aws-sdk/client-bedrock-agent-runtime";

import type { ModelResponse } from "../src/claude.js";
import type { DocumentMetadata } from "../src/types.js";

export function metadata(overrides: Partial<DocumentMetadata> = {}): DocumentMetadata {
  return {
    documentId: "TEST-TABLE-NATIVE",
    filename: "return-processing-table-native.pdf",
    title: "Return Processing Matrix",
    region: "Global",
    version: "1.0",
    status: "fixture",
    effectiveDate: 20260901,
    representation: "native",
    ...overrides,
  };
}

export function rawResult(
  overrides: Partial<DocumentMetadata> = {},
  text = "Electronics | SG | 30 days | 10% if opened | Serial + photo | Refund",
): KnowledgeBaseRetrievalResult {
  const item = metadata(overrides);
  return {
    content: { type: "TEXT", text },
    location: { type: "S3", s3Location: { uri: "s3://multimodal/aws/extracted-1.png" } },
    metadata: {
      document_id: item.documentId,
      filename: item.filename,
      title: item.title,
      region: item.region,
      version: item.version,
      status: item.status,
      effective_date: item.effectiveDate,
      representation: item.representation,
    },
    score: 0.9,
  };
}

export function citedResponse(text: string, documentTitle: string): ModelResponse {
  return {
    content: [{
      type: "text",
      text,
      citations: [{
        cited_text: "Table evidence.",
        document_index: 0,
        document_title: documentTitle,
        end_char_index: 14,
        file_id: null,
        start_char_index: 0,
        type: "char_location",
      }],
    }],
    stopReason: "end_turn",
  };
}

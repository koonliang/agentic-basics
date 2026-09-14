import type { ModelClient } from "./claude.js";
import { retrieveAndAnswer, type RagResult } from "./rag.js";
import { buildDocumentFilter, type Retriever } from "./retrieval.js";

export const tableRepresentations = ["native", "image"] as const;
export type TableRepresentation = typeof tableRepresentations[number];

const documents: Record<TableRepresentation, { id: string; filename: string }> = {
  native: { id: "TEST-TABLE-NATIVE", filename: "return-processing-table-native.pdf" },
  image: { id: "TEST-TABLE-IMAGE", filename: "return-processing-table-image.pdf" },
};

export interface TableComparison {
  question: string;
  results: Record<TableRepresentation, RagResult>;
}

export async function compareTableRepresentations(
  retriever: Retriever,
  client: ModelClient,
  question: string,
  model: string,
): Promise<TableComparison> {
  const native = await retrieveRepresentation("native", retriever, client, question, model);
  const image = await retrieveRepresentation("image", retriever, client, question, model);
  return { question, results: { native, image } };
}

export function tableDocument(representation: TableRepresentation) {
  return documents[representation];
}

function retrieveRepresentation(
  representation: TableRepresentation,
  retriever: Retriever,
  client: ModelClient,
  question: string,
  model: string,
): Promise<RagResult> {
  return retrieveAndAnswer(
    retriever,
    client,
    question,
    model,
    buildDocumentFilter(documents[representation].id),
  );
}

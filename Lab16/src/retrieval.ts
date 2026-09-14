import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
  type KnowledgeBaseRetrievalResult,
  type RetrievalFilter,
  type RetrieveCommandInput,
} from "@aws-sdk/client-bedrock-agent-runtime";

import { formatDate } from "./dates.js";
import {
  documentStatuses,
  representations,
  regions,
  type DocumentMetadata,
  type FilterCriteria,
} from "./types.js";

export interface EvidenceChunk {
  text: string;
  sourceUri: string;
  filename: string;
  metadata: DocumentMetadata;
  score?: number;
}

export interface Retriever {
  retrieve(question: string, filter?: RetrievalFilter): Promise<KnowledgeBaseRetrievalResult[]>;
}

export class BedrockRetriever implements Retriever {
  private readonly client: BedrockAgentRuntimeClient;

  constructor(private readonly knowledgeBaseId: string, region: string) {
    this.client = new BedrockAgentRuntimeClient({ region });
  }

  async retrieve(question: string, filter?: RetrievalFilter): Promise<KnowledgeBaseRetrievalResult[]> {
    const response = await this.client.send(new RetrieveCommand(
      buildRetrieveInput(this.knowledgeBaseId, question, filter),
    ));
    return response.retrievalResults ?? [];
  }
}

export function buildRetrieveInput(
  knowledgeBaseId: string,
  question: string,
  filter?: RetrievalFilter,
): RetrieveCommandInput {
  return {
    knowledgeBaseId,
    retrievalQuery: { text: question },
    retrievalConfiguration: {
      vectorSearchConfiguration: {
        numberOfResults: 5,
        ...(filter ? { filter } : {}),
      },
    },
  };
}

export function buildPolicyFilter(criteria: FilterCriteria): RetrievalFilter {
  const regionFilter: RetrievalFilter = criteria.region === "Global"
    ? { equals: { key: "region", value: "Global" } }
    : {
        orAll: [
          { equals: { key: "region", value: criteria.region } },
          { equals: { key: "region", value: "Global" } },
        ],
      };
  return {
    andAll: [
      regionFilter,
      { equals: { key: "status", value: criteria.status } },
      { lessThanOrEquals: { key: "effective_date", value: criteria.effectiveOnOrBefore } },
    ],
  };
}

export function buildDocumentFilter(documentId: string): RetrievalFilter {
  return { equals: { key: "document_id", value: documentId } };
}

export function toEvidenceChunks(results: KnowledgeBaseRetrievalResult[]): EvidenceChunk[] {
  return results.flatMap((result): EvidenceChunk[] => {
    const text = result.content?.text?.trim();
    const sourceUri = result.location?.s3Location?.uri;
    if (!text || !sourceUri) return [];
    const metadata = parseDocumentMetadata(result.metadata);
    return [{
      text,
      sourceUri,
      filename: metadata.filename,
      metadata,
      ...(result.score === undefined ? {} : { score: result.score }),
    }];
  });
}

export function formatEvidence(chunks: EvidenceChunk[], fullText = false): string {
  if (chunks.length === 0) return "No usable text evidence was retrieved.";
  return chunks.map((chunk, index) => {
    const score = chunk.score === undefined ? "n/a" : chunk.score.toFixed(4);
    const metadata = chunk.metadata;
    return [
      `${index + 1}. ${chunk.filename} | score=${score}`,
      `   region=${metadata.region} status=${metadata.status} version=${metadata.version} effective=${formatDate(metadata.effectiveDate)} representation=${metadata.representation}`,
      `   ${fullText ? chunk.text : preview(chunk.text)}`,
    ].join("\n");
  }).join("\n");
}

export function formatFilter(criteria: FilterCriteria): string {
  const included = criteria.region === "Global" ? "Global" : `${criteria.region} or Global`;
  return `region=${included} status=${criteria.status} effective_date<=${formatDate(criteria.effectiveOnOrBefore)}`;
}

function parseDocumentMetadata(value: Record<string, unknown> | undefined): DocumentMetadata {
  if (!value) throw new Error("A retrieved PDF is missing document metadata.");
  const region = requiredString(value.region, "region");
  const status = requiredString(value.status, "status");
  const representation = requiredString(value.representation, "representation");
  if (!regions.includes(region as DocumentMetadata["region"])) throw new Error(`Invalid region metadata: ${region}.`);
  if (!documentStatuses.includes(status as DocumentMetadata["status"])) throw new Error(`Invalid status metadata: ${status}.`);
  if (!representations.includes(representation as DocumentMetadata["representation"])) {
    throw new Error(`Invalid representation metadata: ${representation}.`);
  }
  const effectiveDate = value.effective_date;
  if (typeof effectiveDate !== "number") throw new Error("Metadata effective_date must be a number.");
  formatDate(effectiveDate);
  return {
    documentId: requiredString(value.document_id, "document_id"),
    filename: requiredString(value.filename, "filename"),
    title: requiredString(value.title, "title"),
    region: region as DocumentMetadata["region"],
    version: requiredString(value.version, "version"),
    status: status as DocumentMetadata["status"],
    effectiveDate,
    representation: representation as DocumentMetadata["representation"],
  };
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Metadata ${name} must be a non-empty string.`);
  }
  return value;
}

function preview(text: string): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length <= 240 ? singleLine : `${singleLine.slice(0, 237)}...`;
}

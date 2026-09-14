import path from "node:path";

import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
  type KnowledgeBaseRetrievalResult,
  type RetrievalFilter,
  type RetrieveCommandInput,
} from "@aws-sdk/client-bedrock-agent-runtime";

import { formatDate } from "./dates.js";
import {
  policyStatuses,
  regions,
  type FilterCriteria,
  type PolicyMetadata,
} from "./types.js";

export interface EvidenceChunk {
  text: string;
  sourceUri: string;
  filename: string;
  metadata: PolicyMetadata;
  score?: number;
}

export interface Retriever {
  retrieve(
    question: string,
    criteria?: FilterCriteria,
  ): Promise<KnowledgeBaseRetrievalResult[]>;
}

export class BedrockRetriever implements Retriever {
  private readonly client: BedrockAgentRuntimeClient;

  constructor(
    private readonly knowledgeBaseId: string,
    region: string,
  ) {
    this.client = new BedrockAgentRuntimeClient({ region });
  }

  async retrieve(
    question: string,
    criteria?: FilterCriteria,
  ): Promise<KnowledgeBaseRetrievalResult[]> {
    const response = await this.client.send(new RetrieveCommand(
      buildRetrieveInput(this.knowledgeBaseId, question, criteria),
    ));
    return response.retrievalResults ?? [];
  }
}

export function buildRetrieveInput(
  knowledgeBaseId: string,
  question: string,
  criteria?: FilterCriteria,
): RetrieveCommandInput {
  return {
    knowledgeBaseId,
    retrievalQuery: { text: question },
    retrievalConfiguration: {
      vectorSearchConfiguration: {
        numberOfResults: 5,
        ...(criteria ? { filter: buildRetrievalFilter(criteria) } : {}),
      },
    },
  };
}

export function buildRetrievalFilter(criteria: FilterCriteria): RetrievalFilter {
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
      {
        lessThanOrEquals: {
          key: "effective_date",
          value: criteria.effectiveOnOrBefore,
        },
      },
    ],
  };
}

export function toEvidenceChunks(
  results: KnowledgeBaseRetrievalResult[],
): EvidenceChunk[] {
  return results.flatMap((result): EvidenceChunk[] => {
    const text = result.content?.text?.trim();
    const sourceUri = result.location?.s3Location?.uri;
    const filename = sourceUri ? pdfFilename(sourceUri) : undefined;
    if (!text || !sourceUri || !filename) return [];
    return [{
      text,
      sourceUri,
      filename,
      metadata: parsePolicyMetadata(result.metadata),
      ...(result.score === undefined ? {} : { score: result.score }),
    }];
  });
}

export function formatEvidence(chunks: EvidenceChunk[]): string {
  if (chunks.length === 0) return "No usable text evidence was retrieved.";
  return chunks.map((chunk, index) => {
    const score = chunk.score === undefined ? "n/a" : chunk.score.toFixed(4);
    const metadata = chunk.metadata;
    return [
      `${index + 1}. ${chunk.filename} | score=${score}`,
      `   region=${metadata.region} status=${metadata.status} version=${metadata.version} effective=${formatDate(metadata.effectiveDate)}`,
    ].join("\n");
  }).join("\n");
}

export function formatFilter(criteria: FilterCriteria): string {
  const regionsIncluded = criteria.region === "Global"
    ? "Global"
    : `${criteria.region} or Global`;
  return `region=${regionsIncluded} status=${criteria.status} effective_date<=${formatDate(criteria.effectiveOnOrBefore)}`;
}

function parsePolicyMetadata(value: Record<string, unknown> | undefined): PolicyMetadata {
  if (!value) throw new Error("A retrieved PDF is missing policy metadata.");
  const region = requiredString(value.region, "region");
  const status = requiredString(value.status, "status");
  if (!regions.includes(region as typeof regions[number])) {
    throw new Error(`Invalid region metadata: ${region}.`);
  }
  if (!policyStatuses.includes(status as typeof policyStatuses[number])) {
    throw new Error(`Invalid status metadata: ${status}.`);
  }
  const effectiveDate = value.effective_date;
  if (typeof effectiveDate !== "number") {
    throw new Error("Metadata effective_date must be a number.");
  }
  formatDate(effectiveDate);
  return {
    documentId: requiredString(value.document_id, "document_id"),
    title: requiredString(value.title, "title"),
    region: region as PolicyMetadata["region"],
    version: requiredString(value.version, "version"),
    status: status as PolicyMetadata["status"],
    effectiveDate,
  };
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Metadata ${name} must be a non-empty string.`);
  }
  return value;
}

function pdfFilename(uri: string): string | undefined {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== "s3:") return undefined;
    const filename = decodeURIComponent(path.posix.basename(parsed.pathname));
    return filename.toLowerCase().endsWith(".pdf") ? filename : undefined;
  } catch {
    return undefined;
  }
}

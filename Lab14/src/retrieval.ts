import path from "node:path";

import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
  type KnowledgeBaseRetrievalResult,
  type RetrieveCommandInput,
} from "@aws-sdk/client-bedrock-agent-runtime";

export interface EvidenceChunk {
  text: string;
  sourceUri: string;
  filename: string;
  score?: number;
}

export interface Retriever {
  retrieve(question: string): Promise<KnowledgeBaseRetrievalResult[]>;
}

export class BedrockRetriever implements Retriever {
  private readonly client: BedrockAgentRuntimeClient;

  constructor(
    private readonly knowledgeBaseId: string,
    region: string,
  ) {
    this.client = new BedrockAgentRuntimeClient({ region });
  }

  async retrieve(question: string): Promise<KnowledgeBaseRetrievalResult[]> {
    const response = await this.client.send(new RetrieveCommand(
      buildRetrieveInput(this.knowledgeBaseId, question),
    ));
    return response.retrievalResults ?? [];
  }
}

export function parseQuestion(args: string[]): string {
  const question = args.join(" ").trim();
  if (!question) throw new Error("Pass a question after --.");
  return question;
}

export function buildRetrieveInput(
  knowledgeBaseId: string,
  question: string,
): RetrieveCommandInput {
  return {
    knowledgeBaseId,
    retrievalQuery: { text: question },
    retrievalConfiguration: {
      vectorSearchConfiguration: { numberOfResults: 5 },
    },
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
      ...(result.score === undefined ? {} : { score: result.score }),
    }];
  });
}

export function formatEvidence(chunks: EvidenceChunk[]): string {
  if (chunks.length === 0) return "No usable text evidence was retrieved.";
  return chunks.map((chunk, index) => {
    const score = chunk.score === undefined ? "n/a" : chunk.score.toFixed(4);
    return `${index + 1}. ${chunk.filename} | score=${score} | ${chunk.sourceUri}`;
  }).join("\n");
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

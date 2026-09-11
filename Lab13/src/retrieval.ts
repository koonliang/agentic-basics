import type {
  KnowledgeBaseRetrievalResult,
  RetrieveCommandInput,
} from "@aws-sdk/client-bedrock-agent-runtime";

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

export function formatRetrievalResults(results: KnowledgeBaseRetrievalResult[]): string {
  if (results.length === 0) return "No retrieval results were returned.";

  return results.map((result, index) => {
    const score = result.score === undefined ? "n/a" : result.score.toFixed(4);
    const source = result.location?.s3Location?.uri ?? result.location?.type ?? "unknown";
    const content = result.content?.text?.trim() || `[${result.content?.type ?? "unknown"} content]`;
    const metadata = result.metadata && Object.keys(result.metadata).length > 0
      ? JSON.stringify(result.metadata)
      : "{}";
    return [
      `Result ${index + 1} | score=${score}`,
      `Source: ${source}`,
      `Metadata: ${metadata}`,
      content,
    ].join("\n");
  }).join("\n\n");
}

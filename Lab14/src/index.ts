import { ClaudeClient } from "./claude.js";
import { loadDemoConfig } from "./config.js";
import { compareAnswers } from "./rag.js";
import {
  BedrockRetriever,
  formatEvidence,
  parseQuestion,
} from "./retrieval.js";

try {
  const question = parseQuestion(process.argv.slice(2));
  const config = loadDemoConfig();
  const retriever = new BedrockRetriever(config.knowledgeBaseId, config.region);
  const model = new ClaudeClient(config.anthropicApiKey, config.anthropicBaseUrl);
  const result = await compareAnswers(retriever, model, question, {
    model: config.model,
  });

  console.log(`[ungrounded]\n${result.ungrounded}`);
  console.log(`\n[retrieved]\n${formatEvidence(result.evidence)}`);
  console.log(`\n[grounded]\n${result.grounded.text}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

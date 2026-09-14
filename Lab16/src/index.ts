import { parseDemoArguments } from "./arguments.js";
import { ClaudeClient } from "./claude.js";
import { loadDemoConfig } from "./config.js";
import { compareVersions } from "./rag.js";
import { BedrockRetriever, formatEvidence, formatFilter } from "./retrieval.js";

try {
  const input = parseDemoArguments(process.argv.slice(2));
  const config = loadDemoConfig();
  const retriever = new BedrockRetriever(config.knowledgeBaseId, config.region);
  const model = new ClaudeClient(config.anthropicApiKey, config.anthropicBaseUrl);
  const result = await compareVersions(retriever, model, input.question, input.criteria, config.model);

  console.log(`[filter]\n${formatFilter(result.criteria)}`);
  console.log(`\n[unfiltered retrieved]\n${formatEvidence(result.unfiltered.evidence)}`);
  console.log(`\n[unfiltered answer]\n${result.unfiltered.answer.text}`);
  console.log(`\n[filtered retrieved]\n${formatEvidence(result.filtered.evidence)}`);
  console.log(`\n[filtered answer]\n${result.filtered.answer.text}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

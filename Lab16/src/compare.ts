import { parseQuestion } from "./arguments.js";
import { ClaudeClient } from "./claude.js";
import { loadDemoConfig } from "./config.js";
import { BedrockRetriever, formatEvidence } from "./retrieval.js";
import { compareTableRepresentations, tableRepresentations } from "./table-comparison.js";

try {
  const question = parseQuestion(process.argv.slice(2));
  const config = loadDemoConfig();
  const comparison = await compareTableRepresentations(
    new BedrockRetriever(config.knowledgeBaseId, config.region),
    new ClaudeClient(config.anthropicApiKey, config.anthropicBaseUrl),
    question,
    config.model,
  );
  for (const representation of tableRepresentations) {
    const result = comparison.results[representation];
    console.log(`[${representation} retrieved]\n${formatEvidence(result.evidence)}`);
    console.log(`\n[${representation} answer]\n${result.answer.text}\n`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

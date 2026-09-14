import { evaluateAnswers, loadAnswerEvaluationCases } from "./answer-evaluation.js";
import { ClaudeClient } from "./claude.js";
import { loadDemoConfig } from "./config.js";
import { BedrockRetriever, formatEvidence } from "./retrieval.js";

try {
  const config = loadDemoConfig();
  const report = await evaluateAnswers(
    new BedrockRetriever(config.knowledgeBaseId, config.region),
    new ClaudeClient(config.anthropicApiKey, config.anthropicBaseUrl),
    await loadAnswerEvaluationCases(),
    config.model,
  );
  console.table(report.cases.map((result) => ({
    case: result.id,
    representation: result.representation,
    pass: result.passed,
    citations: result.citations.join(", ") || "(none)",
    reason: result.reason,
  })));
  for (const result of report.cases.filter((item) => !item.passed)) {
    console.log(`\n[failed: ${result.id} / ${result.representation}]`);
    console.log(`[answer]\n${result.answer || "No answer was produced."}`);
    console.log(`[retrieved]\n${formatEvidence(result.evidence, true)}`);
  }
  console.log(`[score] ${report.passed}/${report.total} passed`);
  if (report.failed > 0) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

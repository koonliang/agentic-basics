import { loadRetrievalConfig } from "./config.js";
import { evaluateRetrieval, loadEvaluationCases } from "./evaluation.js";
import { BedrockRetriever } from "./retrieval.js";

try {
  const config = loadRetrievalConfig();
  const report = await evaluateRetrieval(
    new BedrockRetriever(config.knowledgeBaseId, config.region),
    await loadEvaluationCases(),
  );
  console.table(report.cases.map((result) => ({
    case: result.id,
    pass: result.passed,
    unfiltered: result.unfilteredSources.join(", ") || "(none)",
    filtered: result.filteredSources.join(", ") || "(none)",
    reason: result.reason,
  })));
  console.log(`[score] ${report.passed}/${report.total} passed`);
  if (report.failed > 0) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

import { loadRetrievalConfig } from "./config.js";
import {
  evaluateRetrieval,
  loadRetrievalEvaluationCases,
} from "./retrieval-evaluation.js";
import { BedrockRetriever } from "./retrieval.js";

try {
  const config = loadRetrievalConfig();
  const results = await evaluateRetrieval(
    new BedrockRetriever(config.knowledgeBaseId, config.region),
    await loadRetrievalEvaluationCases(),
  );
  console.table(results.map((result) => ({
    case: result.id,
    pass: result.passed,
    unfiltered: result.unfilteredSources.join(", ") || "(none)",
    filtered: result.filteredSources.join(", ") || "(none)",
    reason: result.reason,
  })));
  const passed = results.filter((result) => result.passed).length;
  console.log(`[score] ${passed}/${results.length} passed`);
  if (passed !== results.length) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

import { ClaudeBatchClient } from "./batch-client.js";
import { loadEvaluationCases } from "./cases.js";
import { createBatchRequests, scoreResults } from "./evaluation.js";
import type { EvaluationReport } from "./types.js";

const [command, batchId] = process.argv.slice(2);
const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is missing. Set it in the repository root .env.");
  process.exitCode = 1;
} else {
  const client = new ClaudeBatchClient(apiKey, process.env.ANTHROPIC_BASE_URL);
  try {
    if (command === "submit") {
      const cases = await loadEvaluationCases();
      const model = process.env.CLAUDE_MODEL ?? "claude-haiku-4-5";
      const batch = await client.create(createBatchRequests(cases, model));
      printBatch(batch);
      console.log(`\nNext: npm run status -- ${batch.id}`);
    } else if (command === "status") {
      const batch = await client.retrieve(requireBatchId(batchId));
      printBatch(batch);
      if (batch.processing_status === "ended") {
        console.log(`\nNext: npm run score -- ${batch.id}`);
      }
    } else if (command === "score") {
      const id = requireBatchId(batchId);
      const batch = await client.retrieve(id);
      if (batch.processing_status !== "ended") {
        throw new Error(`Batch ${id} is ${batch.processing_status}; results are not ready.`);
      }
      const report = scoreResults(await loadEvaluationCases(), await client.results(id));
      printReport(report);
    } else {
      throw new Error("Use submit, status <batch-id>, or score <batch-id>.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

function requireBatchId(value: string | undefined): string {
  if (!value) throw new Error("Provide a Message Batch ID.");
  return value;
}

function printBatch(batch: {
  id: string;
  processing_status: string;
  request_counts: {
    processing: number;
    succeeded: number;
    errored: number;
    canceled: number;
    expired: number;
  };
}): void {
  console.log(`[batch] id=${batch.id} status=${batch.processing_status}`);
  console.log(`[counts] ${JSON.stringify(batch.request_counts)}`);
}

function printReport(report: EvaluationReport): void {
  console.table(report.cases.map((item) => ({
    case: item.customId,
    pass: item.passed,
    expected: item.expectedTool ?? "(none)",
    actual: item.actualTools.join(", ") || "(none)",
    selection: item.selectionCorrect,
    arguments: item.argumentsCorrect ?? "n/a",
    reason: item.reason,
  })));
  console.log(
    `[score] ${report.passed}/${report.total} passed (${(report.passRate * 100).toFixed(1)}%)`,
  );
}

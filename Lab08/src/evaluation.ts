import type {
  BatchResult,
  CaseScore,
  EvaluationCase,
  EvaluationReport,
  ToolCall,
} from "./types.js";

export const evaluationTools = [
  {
    name: "get_order_status",
    description: "Get the status of one order by its order ID.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "Order ID such as A1001" },
      },
      required: ["order_id"],
      additionalProperties: false,
    },
  },
  {
    name: "count_orders",
    description: "Count all orders. Use this for count-only questions, not when order details are requested.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "list_order_ids",
    description: "List order IDs. Use this to discover IDs when details are requested without known IDs.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
];

export function createBatchRequests(cases: EvaluationCase[], model: string) {
  return cases.map((testCase) => ({
    custom_id: testCase.customId,
    params: {
      model,
      max_tokens: 512,
      messages: [{ role: "user" as const, content: testCase.prompt }],
      tools: evaluationTools,
      tool_choice: { type: "auto" as const },
    },
  }));
}

export function scoreResults(cases: EvaluationCase[], results: BatchResult[]): EvaluationReport {
  const byId = new Map(results.map((item) => [item.customId, item]));
  const scores = cases.map((testCase) => scoreCase(testCase, byId.get(testCase.customId)));
  const passed = scores.filter((score) => score.passed).length;
  return {
    total: scores.length,
    passed,
    failed: scores.length - passed,
    passRate: scores.length === 0 ? 0 : passed / scores.length,
    cases: scores,
  };
}

function scoreCase(testCase: EvaluationCase, item: BatchResult | undefined): CaseScore {
  if (!item) return failedScore(testCase, [], "Missing batch result.");
  if (!isRecord(item.result) || item.result.type !== "succeeded" || !isRecord(item.result.message)) {
    const resultType = isRecord(item.result) && typeof item.result.type === "string"
      ? item.result.type
      : "invalid";
    return failedScore(testCase, [], `Batch request result was ${resultType}.`);
  }

  const calls = toolCalls(item.result.message.content);
  if (testCase.expectedTool === null) {
    const passed = calls.length === 0;
    return {
      customId: testCase.customId,
      passed,
      expectedTool: null,
      actualTools: calls.map((call) => call.name),
      selectionCorrect: passed,
      argumentsCorrect: null,
      reason: passed ? "No tool selected as expected." : "Expected no tool call.",
    };
  }

  const selectionCorrect = calls.length === 1 && calls[0]?.name === testCase.expectedTool;
  const argumentsCorrect = selectionCorrect && sameJson(calls[0]?.input, testCase.expectedInput);
  return {
    customId: testCase.customId,
    passed: selectionCorrect && argumentsCorrect,
    expectedTool: testCase.expectedTool,
    actualTools: calls.map((call) => call.name),
    selectionCorrect,
    argumentsCorrect,
    reason: !selectionCorrect
      ? `Expected exactly one ${testCase.expectedTool} call.`
      : argumentsCorrect
        ? "Tool and arguments matched."
        : "Tool matched but arguments did not.",
  };
}

function failedScore(testCase: EvaluationCase, actualTools: string[], reason: string): CaseScore {
  return {
    customId: testCase.customId,
    passed: false,
    expectedTool: testCase.expectedTool,
    actualTools,
    selectionCorrect: false,
    argumentsCorrect: testCase.expectedTool === null ? null : false,
    reason,
  };
}

function toolCalls(content: unknown): ToolCall[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block): ToolCall[] => {
    if (!isRecord(block) || block.type !== "tool_use" ||
        typeof block.name !== "string" || !("input" in block)) return [];
    return [{ name: block.name, input: block.input }];
  });
}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => sameJson(value, right[index]));
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index] && sameJson(left[key], right[key]));
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

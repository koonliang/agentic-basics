import { countOrders, getOrderStatus, listOrderIds } from "./orders.js";
import {
  isRecord,
  isToolUseBlock,
  textFrom,
  type ConversationMessage,
  type ModelClient,
  type ToolUseBlock,
} from "./types.js";

export type ToolChoice = "auto" | "any" | "none";

export interface ClientDemoOptions {
  model: string;
  choice?: ToolChoice;
  parallel?: boolean;
  maxTurns?: number;
  onEvent?: (event: ClientDemoEvent) => void;
}

export type ClientDemoEvent =
  | { type: "model_response"; turn: number; stopReason: string | null }
  | { type: "tool_calls"; count: number; parallel: boolean }
  | { type: "tool_result"; name: string; isError: boolean; output: string };

interface LocalToolResult {
  output: string;
  isError: boolean;
}

export const clientTools = [
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
    description: "Count all orders belonging to the user. Use this for count-only questions, not when order details are also requested.",
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
    description: "List the user's order IDs. Use this to discover IDs when the user asks about all orders or requests order details without providing IDs.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
];

export async function runClientToolDemo(
  client: ModelClient,
  prompt: string,
  options: ClientDemoOptions,
): Promise<string> {
  const messages: ConversationMessage[] = [{ role: "user", content: prompt }];
  const maxTurns = options.maxTurns ?? 4;
  const parallel = options.parallel ?? true;

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const choice = turn === 1 ? (options.choice ?? "auto") : "auto";
    const response = await client.create({
      model: options.model,
      max_tokens: 1_024,
      messages,
      tools: clientTools,
      tool_choice: {
        type: choice,
        ...(!parallel ? { disable_parallel_tool_use: true } : {}),
      },
    });

    options.onEvent?.({ type: "model_response", turn, stopReason: response.stop_reason });

    const calls = response.content.filter(isToolUseBlock);
    if (calls.length === 0) {
      const answer = textFrom(response.content);
      if (response.stop_reason === "end_turn" && answer) return answer;
      if (response.stop_reason === "refusal") throw new Error(answer || "Claude refused the request.");
      throw new Error(`Unexpected stop reason: ${response.stop_reason ?? "null"}`);
    }

    options.onEvent?.({ type: "tool_calls", count: calls.length, parallel });
    const results = parallel
      ? await Promise.all(calls.map(runTool))
      : await runSequentially(calls);

    for (const result of results) {
      options.onEvent?.({
        type: "tool_result",
        name: result.call.name,
        isError: result.result.isError,
        output: result.result.output,
      });
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: results.map(({ call, result }) => ({
        type: "tool_result",
        tool_use_id: call.id,
        content: result.output,
        ...(result.isError ? { is_error: true } : {}),
      })),
    });
  }

  throw new Error(`The client tool loop exceeded ${maxTurns} turns.`);
}

async function runSequentially(calls: ToolUseBlock[]) {
  const results: Array<{ call: ToolUseBlock; result: LocalToolResult }> = [];
  for (const call of calls) results.push(await runTool(call));
  return results;
}

async function runTool(call: ToolUseBlock): Promise<{ call: ToolUseBlock; result: LocalToolResult }> {
  try {
    if (call.name === "count_orders") {
      return { call, result: { output: JSON.stringify({ count: await countOrders() }), isError: false } };
    }

    if (call.name === "list_order_ids") {
      return { call, result: { output: JSON.stringify({ order_ids: await listOrderIds() }), isError: false } };
    }

    if (call.name === "get_order_status") {
      if (!isRecord(call.input) || typeof call.input.order_id !== "string") {
        return { call, result: { output: "order_id must be a string.", isError: true } };
      }

      const order = await getOrderStatus(call.input.order_id);
      if (!order) {
        return { call, result: { output: `Order ${call.input.order_id} was not found.`, isError: true } };
      }
      return { call, result: { output: JSON.stringify(order), isError: false } };
    }

    return { call, result: { output: `Unknown tool: ${call.name}`, isError: true } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { call, result: { output: message, isError: true } };
  }
}

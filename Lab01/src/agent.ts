import { getOrderStatus } from "./orders.js";
import type {
  AgentOptions,
  ConversationMessage,
  ModelClient,
  TextBlock,
  ToolDefinition,
  ToolUseBlock,
} from "./types.js";

export const orderStatusTool: ToolDefinition = {
  name: "get_order_status",
  description:
    "Look up the latest status, carrier, tracking number, and estimated delivery date for an order.",
  input_schema: {
    type: "object",
    properties: {
      order_id: {
        type: "string",
        description: "The order identifier, for example A1001",
      },
    },
    required: ["order_id"],
    additionalProperties: false,
  },
  strict: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isToolUseBlock(block: unknown): block is ToolUseBlock {
  return (
    isRecord(block) &&
    block.type === "tool_use" &&
    typeof block.id === "string" &&
    typeof block.name === "string" &&
    "input" in block
  );
}

function isTextBlock(block: unknown): block is TextBlock {
  return (
    isRecord(block) &&
    block.type === "text" &&
    typeof block.text === "string"
  );
}

async function executeTool(block: ToolUseBlock): Promise<{
  output: string;
  isError: boolean;
}> {
  if (block.name !== orderStatusTool.name) {
    return {
      output: `Unknown tool: ${block.name}`,
      isError: true,
    };
  }

  if (!isRecord(block.input) || typeof block.input.order_id !== "string") {
    return {
      output: "get_order_status requires a string order_id",
      isError: true,
    };
  }

  try {
    const order = await getOrderStatus(block.input.order_id);
    return { output: JSON.stringify(order), isError: false };
  } catch (error) {
    return {
      output: error instanceof Error ? error.message : "Tool execution failed",
      isError: true,
    };
  }
}

export async function runAgent(
  client: ModelClient,
  prompt: string,
  options: AgentOptions,
): Promise<string> {
  const maxTurns = options.maxTurns ?? 4;
  const maxTokens = options.maxTokens ?? 1024;
  const messages: ConversationMessage[] = [
    { role: "user", content: prompt },
  ];

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const response = await client.create({
      model: options.model,
      max_tokens: maxTokens,
      messages,
      tools: [orderStatusTool],
    });

    options.onEvent?.({
      type: "model_response",
      turn,
      stopReason: response.stop_reason,
    });

    messages.push({ role: "assistant", content: response.content });
    const toolCalls = response.content.filter(isToolUseBlock);

    if (toolCalls.length > 0) {
      const results = await Promise.all(
        toolCalls.map(async (toolCall) => {
          options.onEvent?.({
            type: "tool_call",
            name: toolCall.name,
            input: toolCall.input,
          });

          const result = await executeTool(toolCall);
          options.onEvent?.({
            type: "tool_result",
            name: toolCall.name,
            output: result.output,
            isError: result.isError,
          });

          return {
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: result.output,
            is_error: result.isError,
          };
        }),
      );

      messages.push({ role: "user", content: results });
      continue;
    }

    if (response.stop_reason === "end_turn") {
      const text = response.content
        .filter(isTextBlock)
        .map(({ text: value }) => value)
        .join("\n")
        .trim();

      if (!text) throw new Error("Claude ended the turn without a text response");
      return text;
    }

    if (response.stop_reason === "refusal") {
      throw new Error("Claude refused the request");
    }

    throw new Error(`Claude stopped unexpectedly: ${response.stop_reason}`);
  }

  throw new Error(`Agent exceeded the maximum of ${maxTurns} turns`);
}

import type {
  AgentEvent,
  ClaudeTool,
  ConversationMessage,
  McpTool,
  McpToolClient,
  ModelClient,
  ToolUseBlock,
} from "./types.js";

export interface AgentOptions {
  model: string;
  maxTurns?: number;
  maxTokens?: number;
  onEvent?: (event: AgentEvent) => void;
}

export function toClaudeTools(tools: McpTool[]): ClaudeTool[] {
  return tools.map((tool) => {
    if (tool.inputSchema.type !== "object") {
      throw new Error(`MCP tool ${tool.name} must have an object input schema.`);
    }
    const { $schema: _dialect, ...inputSchema } = tool.inputSchema;
    return {
      name: tool.name,
      description: tool.description ?? "",
      input_schema: inputSchema,
    };
  });
}

export async function runMcpAgent(
  modelClient: ModelClient,
  mcpClient: McpToolClient,
  prompt: string,
  options: AgentOptions,
): Promise<string> {
  const discovered = await mcpClient.listTools();
  if (discovered.length === 0) throw new Error("The MCP server exposed no tools.");

  const tools = toClaudeTools(discovered);
  options.onEvent?.({ type: "tools_discovered", names: tools.map((tool) => tool.name) });

  const messages: ConversationMessage[] = [{ role: "user", content: prompt }];
  const maxTurns = options.maxTurns ?? 6;

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const response = await modelClient.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 1_024,
      messages,
      tools,
    });

    options.onEvent?.({ type: "model_response", turn, stopReason: response.stop_reason });
    messages.push({ role: "assistant", content: response.content });

    const calls = response.content.filter(isToolUseBlock);
    if (calls.length > 0) {
      const results = await Promise.all(calls.map(async (call) => {
        options.onEvent?.({ type: "tool_call", name: call.name, input: call.input });
        const result = await mcpClient.callTool(call.name, call.input);
        options.onEvent?.({ type: "tool_result", name: call.name, ...result });
        return {
          type: "tool_result",
          tool_use_id: call.id,
          content: result.output,
          ...(result.isError ? { is_error: true } : {}),
        };
      }));
      messages.push({ role: "user", content: results });
      continue;
    }

    const answer = textFrom(response.content);
    if (response.stop_reason === "end_turn" && answer) return answer;
    if (response.stop_reason === "refusal") throw new Error(answer || "Claude refused the request.");
    throw new Error(`Unexpected stop reason: ${response.stop_reason ?? "null"}`);
  }

  throw new Error(`The MCP agent exceeded ${maxTurns} turns.`);
}

function isToolUseBlock(block: unknown): block is ToolUseBlock {
  return isRecord(block) && block.type === "tool_use" &&
    typeof block.id === "string" && typeof block.name === "string" && "input" in block;
}

function textFrom(content: unknown[]): string {
  return content
    .filter((block): block is { type: "text"; text: string } =>
      isRecord(block) && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

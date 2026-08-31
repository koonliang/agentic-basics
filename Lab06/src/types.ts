export type JsonSchema = Record<string, unknown>;

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: JsonSchema;
}

export interface McpToolResult {
  output: string;
  isError: boolean;
}

export interface McpToolClient {
  listTools(): Promise<McpTool[]>;
  callTool(name: string, input: unknown): Promise<McpToolResult>;
}

export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: JsonSchema;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string | unknown[];
}

export interface ModelRequest {
  model: string;
  max_tokens: number;
  messages: ConversationMessage[];
  tools: ClaudeTool[];
}

export interface ModelResponse {
  content: unknown[];
  stop_reason: string | null;
}

export interface ModelClient {
  create(request: ModelRequest): Promise<ModelResponse>;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export type AgentEvent =
  | { type: "tools_discovered"; names: string[] }
  | { type: "model_response"; turn: number; stopReason: string | null }
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "tool_result"; name: string; output: string; isError: boolean };

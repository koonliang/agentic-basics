export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
  strict: true;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string | unknown[];
}

export interface ModelRequest {
  model: string;
  max_tokens: number;
  messages: ConversationMessage[];
  tools: ToolDefinition[];
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

export interface TextBlock {
  type: "text";
  text: string;
}

export type AgentEvent =
  | { type: "model_response"; turn: number; stopReason: string | null }
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "tool_result"; name: string; output: string; isError: boolean };

export interface AgentOptions {
  model: string;
  maxTurns?: number;
  maxTokens?: number;
  onEvent?: (event: AgentEvent) => void;
}

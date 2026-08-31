export interface ConversationMessage {
  role: "user" | "assistant";
  content: string | unknown[];
}

export interface ModelRequest {
  model: string;
  max_tokens: number;
  messages: ConversationMessage[];
  tools?: unknown[];
  tool_choice?: {
    type: "auto" | "any" | "none";
    disable_parallel_tool_use?: boolean;
  };
}

export interface ModelResponse {
  content: unknown[];
  stop_reason: string | null;
}

export interface ModelClient {
  create(request: ModelRequest): Promise<ModelResponse>;
}

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isTextBlock(value: unknown): value is TextBlock {
  return isRecord(value) && value.type === "text" && typeof value.text === "string";
}

export function isToolUseBlock(value: unknown): value is ToolUseBlock {
  return (
    isRecord(value) &&
    value.type === "tool_use" &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    "input" in value
  );
}

export function textFrom(content: unknown[]): string {
  return content.filter(isTextBlock).map((block) => block.text).join("\n").trim();
}

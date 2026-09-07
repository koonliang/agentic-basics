import type { AgentEvent } from "./agent.js";

export interface InvocationRequest {
  prompt: string;
}

export interface RuntimeEvent {
  event: "trace" | "final";
  data: unknown;
}

export type AgentRunner = (prompt: string) => AsyncIterable<AgentEvent>;

export function validateInvocation(value: unknown): InvocationRequest {
  if (!isRecord(value) || typeof value.prompt !== "string" || value.prompt.trim() === "") {
    throw new Error("prompt must be a non-empty string");
  }
  return { prompt: value.prompt };
}

export async function* processInvocation(
  value: unknown,
  runAgent: AgentRunner,
): AsyncGenerator<RuntimeEvent> {
  const request = validateInvocation(value);
  let finalResult: string | undefined;

  for await (const event of runAgent(request.prompt)) {
    if (event.type === "done") {
      if (!event.success) throw new Error(event.result);
      finalResult = event.result;
      continue;
    }
    if (event.type !== "text") yield { event: "trace", data: event };
  }

  if (!finalResult) throw new Error("Agent completed without a final result.");
  yield { event: "final", data: { response: finalResult } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

import type { AgentRole } from "./config.js";

export type TraceType =
  | "agent_discovered"
  | "routing_started"
  | "routing_completed"
  | "delegation_started"
  | "tool_use"
  | "tool_result"
  | "delegation_completed"
  | "synthesis_started"
  | "synthesis_completed"
  | "error";

export interface TraceEvent {
  durationMs?: number;
  isError?: boolean;
  message: string;
  source: AgentRole;
  specialist?: Exclude<AgentRole, "coordinator">;
  timestamp: string;
  tool?: string;
  type: TraceType;
}

export type TraceSink = (event: TraceEvent) => void;

export function createTrace(event: Omit<TraceEvent, "timestamp">): TraceEvent {
  return { ...event, timestamp: new Date().toISOString() };
}

export function logTrace(event: TraceEvent): void {
  console.log(JSON.stringify({ event: "orchestration_trace", ...event }));
}

export function formatTrace(event: TraceEvent): string {
  const duration = event.durationMs === undefined ? "" : ` (${event.durationMs} ms)`;
  return `[${event.source}] ${event.message}${duration}`;
}

export function tracesFromUnknown(value: unknown): TraceEvent[] {
  const traces: TraceEvent[] = [];
  collectTraces(value, traces);
  return traces;
}

function collectTraces(value: unknown, traces: TraceEvent[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectTraces(item, traces);
    return;
  }
  if (!isRecord(value)) return;

  if (isRecord(value.trace)) {
    const trace = parseTrace(value.trace);
    if (trace) traces.push(trace);
  }
  for (const nested of Object.values(value)) collectTraces(nested, traces);
}

function parseTrace(value: Record<string, unknown>): TraceEvent | undefined {
  if (
    typeof value.type !== "string"
    || typeof value.source !== "string"
    || typeof value.message !== "string"
    || typeof value.timestamp !== "string"
  ) return undefined;
  return value as unknown as TraceEvent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

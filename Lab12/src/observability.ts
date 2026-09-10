import { randomUUID } from "node:crypto";

import {
  context,
  metrics,
  propagation,
  SpanStatusCode,
  trace,
  type TextMapGetter,
} from "@opentelemetry/api";

import type { AgentRole } from "./config.js";
import type { TraceEvent } from "./trace.js";

const tracer = trace.getTracer("openinference.instrumentation.agentic-basics", "1.0.0");
const meter = metrics.getMeter("agentic-basics", "1.0.0");
const operationCount = meter.createCounter("agentic_basics.operations");
const operationDuration = meter.createHistogram("agentic_basics.operation.duration", { unit: "ms" });

const headerGetter: TextMapGetter<Record<string, string>> = {
  get(carrier, key) {
    return carrier[key] ?? carrier[key.toLowerCase()];
  },
  keys(carrier) {
    return Object.keys(carrier);
  },
};

export interface TraceHeaders {
  baggage?: string;
  traceId?: string;
  traceParent?: string;
  traceState?: string;
}

export async function withAgentSpan<T>(
  role: AgentRole,
  prompt: string,
  sessionId: string,
  headers: Record<string, string>,
  operation: () => Promise<T>,
): Promise<T> {
  const extracted = propagation.extract(context.active(), lowerCaseKeys(headers), headerGetter);
  const parent = propagation.setBaggage(extracted, propagation.createBaggage({
    "session.id": { value: sessionId },
  }));
  return tracer.startActiveSpan(`agentic-basics.${role}`, {
    attributes: {
      "openinference.span.kind": "AGENT",
      "input.value": prompt,
      "input.mime_type": "text/plain",
      "session.id": sessionId,
      "agentic_basics.role": role,
    },
  }, parent, async (span) => {
    try {
      const result = await operation();
      span.setAttribute("output.value", String(result));
      span.setAttribute("output.mime_type", "text/plain");
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error instanceof Error ? error : String(error));
      span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}

export async function withToolSpan<T>(
  toolName: string,
  task: string,
  operation: () => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(toolName, {
    attributes: {
      "openinference.span.kind": "TOOL",
      "tool.name": toolName,
      "tool.id": randomUUID(),
      "tool.parameters": JSON.stringify({ task }),
      "input.value": task,
      "input.mime_type": "text/plain",
    },
  }, async (span) => {
    try {
      const result = await operation();
      span.setAttribute("output.value", String(result));
      span.setAttribute("output.mime_type", "text/plain");
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error instanceof Error ? error : String(error));
      span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}

export function currentTraceHeaders(): TraceHeaders {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  const spanContext = trace.getActiveSpan()?.spanContext();
  return {
    ...(carrier.baggage ? { baggage: carrier.baggage } : {}),
    ...(spanContext?.traceId ? { traceId: spanContext.traceId } : {}),
    ...(carrier.traceparent ? { traceParent: carrier.traceparent } : {}),
    ...(carrier.tracestate ? { traceState: carrier.tracestate } : {}),
  };
}

export function traceCorrelation(sessionId?: string): Record<string, string> {
  const spanContext = trace.getActiveSpan()?.spanContext();
  return {
    ...(sessionId ? { sessionId } : {}),
    ...(spanContext?.traceId ? { traceId: spanContext.traceId, spanId: spanContext.spanId } : {}),
  };
}

export function recordTraceMetric(event: TraceEvent): void {
  if (!event.type.endsWith("_completed") && event.type !== "error") return;
  const attributes = {
    role: event.source,
    operation: event.type.replace(/_(completed|started)$/, ""),
    outcome: event.isError ? "error" : "success",
    ...(event.specialist ? { specialist: event.specialist } : {}),
  };
  operationCount.add(1, attributes);
  if (event.durationMs !== undefined) operationDuration.record(event.durationMs, attributes);
}

function lowerCaseKeys(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

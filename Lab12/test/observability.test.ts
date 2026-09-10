import assert from "node:assert/strict";
import test from "node:test";

import { context, metrics, propagation, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";

test("records correlated OpenInference spans and operation metrics", async () => {
  const spanExporter = new InMemorySpanExporter();
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  const tracerProvider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(spanExporter)],
  });
  trace.setGlobalTracerProvider(tracerProvider);
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());

  const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const meterProvider = new MeterProvider({
    readers: [new PeriodicExportingMetricReader({ exporter: metricExporter, exportIntervalMillis: 60_000 })],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  const { currentTraceHeaders, recordTraceMetric, withAgentSpan, withToolSpan } = await import("../src/observability.js");
  let propagatedTraceId: string | undefined;
  const result = await withAgentSpan(
    "coordinator",
    "investigate",
    "session-1",
    { traceparent: "00-11111111111111111111111111111111-2222222222222222-01" },
    () => withToolSpan("delegate_order_investigator", "verify order", async () => {
      propagatedTraceId = currentTraceHeaders().traceId;
      return "verified";
    }),
  );
  recordTraceMetric({
    durationMs: 12,
    message: "completed",
    source: "coordinator",
    timestamp: new Date().toISOString(),
    type: "routing_completed",
  });
  await meterProvider.forceFlush();

  assert.equal(result, "verified");
  assert.equal(propagatedTraceId, "11111111111111111111111111111111");
  const spans = spanExporter.getFinishedSpans();
  assert.equal(spans.length, 2);
  assert.equal(spans.find(({ name }) => name === "agentic-basics.coordinator")?.attributes["openinference.span.kind"], "AGENT");
  assert.equal(spans.find(({ name }) => name === "delegate_order_investigator")?.attributes["openinference.span.kind"], "TOOL");
  const metricNames = metricExporter.getMetrics().flatMap(({ scopeMetrics }) =>
    scopeMetrics.flatMap(({ metrics: values }) => values.map(({ descriptor }) => descriptor.name))
  );
  assert.ok(metricNames.includes("agentic_basics.operations"));
  assert.ok(metricNames.includes("agentic_basics.operation.duration"));

  await tracerProvider.shutdown();
  await meterProvider.shutdown();
});

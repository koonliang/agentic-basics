import assert from "node:assert/strict";
import test from "node:test";

import type { BedrockAgentCoreClient } from "@aws-sdk/client-bedrock-agentcore";
import type { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";

import {
  collectSessionSpans,
  evaluateCase,
  findTraceId,
  type EvaluationCase,
} from "../src/evaluation.js";

const fixture: EvaluationCase = {
  expectedResponse: "verified answer",
  expectedTools: ["delegate_order_investigator"],
  id: "order",
  prompt: "verify order",
  trajectoryEvaluator: "Builtin.TrajectoryExactOrderMatch",
};

test("collects session spans from the unified CloudWatch stream", async () => {
  const client = {
    async send() {
      return {
        events: [{ eventId: "1", message: JSON.stringify({
          attributes: {
            "openinference.span.kind": "AGENT",
            "output.value": "done",
            "session.id": "session-1",
            "agentic_basics.role": "coordinator",
          },
          traceId: "abc",
          spanId: "def",
        }) }],
      };
    },
  } as unknown as CloudWatchLogsClient;

  const spans = await collectSessionSpans(client, "/runtime/logs", "session-1", 0, { pollMs: 0, timeoutMs: 10 });
  assert.equal(spans[0]?.traceId, "abc");
  assert.equal(findTraceId(spans, "session-1"), "abc");
});

test("falls back to aws/spans when the unified log group is unavailable", async () => {
  const searched: string[] = [];
  const client = {
    async send(command: { input: Record<string, unknown> }) {
      const group = String(command.input.logGroupName);
      searched.push(`${group}/${command.input.logStreamNamePrefix}`);
      if (group !== "aws/spans") {
        throw Object.assign(new Error("missing"), { name: "ResourceNotFoundException" });
      }
      return {
        events: [{ message: JSON.stringify({
          attributes: {
            "openinference.span.kind": "AGENT",
            "output.value": "done",
            "session.id": "session-1",
            "agentic_basics.role": "coordinator",
          },
          spanId: "span-1",
          traceId: "trace-1",
        }) }],
      };
    },
  } as unknown as CloudWatchLogsClient;

  const spans = await collectSessionSpans(client, "/runtime/logs", "session-1", 0, { pollMs: 0, timeoutMs: 10 });
  assert.equal(spans.length, 1);
  assert.ok(searched.includes("/runtime/logs/spans"));
  assert.ok(searched.includes("aws/spans/default"));
});

test("combines split spans with their correlated runtime events", async () => {
  const client = {
    async send(command: { input: Record<string, unknown> }) {
      const group = String(command.input.logGroupName);
      const stream = String(command.input.logStreamNamePrefix);
      if (group === "aws/spans") {
        throw Object.assign(new Error("missing"), { name: "ResourceNotFoundException" });
      }
      if (stream === "otel-rt-logs") {
        return { events: [{ eventId: "event", message: JSON.stringify({
          body: { output: { messages: [{ role: "assistant", content: "done" }] } },
          spanId: "span-1",
          traceId: "trace-1",
        }) }] };
      }
      return { events: [{ eventId: "span", message: JSON.stringify({
        attributes: {
          "agentic_basics.role": "coordinator",
          "openinference.span.kind": "AGENT",
          "session.id": "session-1",
        },
        spanId: "span-1",
        traceId: "trace-1",
      }) }] };
    },
  } as unknown as CloudWatchLogsClient;

  const documents = await collectSessionSpans(client, "/runtime/logs", "session-1", 0, { pollMs: 0, timeoutMs: 10 });
  assert.equal(documents.length, 2);
  assert.ok(documents.some((document) => "body" in document));
});

test("surfaces CloudWatch authorization errors", async () => {
  const client = {
    async send() {
      throw Object.assign(new Error("denied"), { name: "AccessDeniedException" });
    },
  } as unknown as CloudWatchLogsClient;

  await assert.rejects(
    collectSessionSpans(client, "/runtime/logs", "session-1", 0, { pollMs: 0, timeoutMs: 10 }),
    /denied/,
  );
});

test("waits for delayed spans and deduplicates paginated events", async () => {
  let primaryRequests = 0;
  const client = {
    async send(command: { input: Record<string, unknown> }) {
      if (command.input.logGroupName === "aws/spans") {
        throw Object.assign(new Error("missing"), { name: "ResourceNotFoundException" });
      }
      if (command.input.logStreamNamePrefix === "otel-rt-logs") return { events: [] };
      primaryRequests += 1;
      if (primaryRequests === 1) return { events: [] };
      const event = { eventId: "same-event", message: JSON.stringify({
        attributes: {
          "openinference.span.kind": "AGENT",
          "output.value": "done",
          "session.id": "session-1",
          "agentic_basics.role": "coordinator",
        },
        spanId: "span-1",
        traceId: "trace-1",
      }) };
      return command.input.nextToken
        ? { events: [event], nextToken: "page-2" }
        : { events: [event], nextToken: "page-2" };
    },
  } as unknown as CloudWatchLogsClient;

  const spans = await collectSessionSpans(client, "/runtime/logs", "session-1", 0, {
    pollMs: 0,
    timeoutMs: 100,
  });
  assert.equal(spans.length, 1);
  assert.ok(primaryRequests >= 2);
});

test("reports searched locations and partial telemetry on timeout", async () => {
  const client = {
    async send(command: { input: Record<string, unknown> }) {
      if (command.input.logGroupName === "aws/spans") {
        throw Object.assign(new Error("missing"), { name: "ResourceNotFoundException" });
      }
      return { events: [{ eventId: "span", message: JSON.stringify({
        attributes: { "openinference.span.kind": "TOOL" },
        spanId: "span-1",
        traceId: "trace-1",
      }) }] };
    },
  } as unknown as CloudWatchLogsClient;

  await assert.rejects(
    collectSessionSpans(client, "/runtime/logs", "session-1", 0, { pollMs: 0, timeoutMs: 10 }),
    /Searched \/runtime\/logs\/spans, aws\/spans\/default, \/runtime\/logs\/otel-rt-logs; found 1 span\(s\)/,
  );
});

test("waits for the coordinator after a specialist span is complete", async () => {
  let primaryRequests = 0;
  const specialist = {
    attributes: {
      "agentic_basics.role": "policy-specialist",
      "openinference.span.kind": "AGENT",
      "output.value": "specialist answer",
      "session.id": "session-1",
    },
    spanId: "specialist-span",
    traceId: "trace-1",
  };
  const coordinator = {
    attributes: {
      "agentic_basics.role": "coordinator",
      "openinference.span.kind": "AGENT",
      "output.value": "coordinator answer",
      "session.id": "session-1",
    },
    spanId: "coordinator-span",
    traceId: "trace-1",
  };
  const client = {
    async send(command: { input: Record<string, unknown> }) {
      if (command.input.logGroupName === "aws/spans") {
        throw Object.assign(new Error("missing"), { name: "ResourceNotFoundException" });
      }
      if (command.input.logStreamNamePrefix === "otel-rt-logs") return { events: [] };
      primaryRequests += 1;
      const spans = primaryRequests === 1 ? [specialist] : [specialist, coordinator];
      return {
        events: spans.map((span) => ({
          eventId: span.spanId,
          message: JSON.stringify(span),
        })),
      };
    },
  } as unknown as CloudWatchLogsClient;

  await collectSessionSpans(client, "/runtime/logs", "session-1", 0, { pollMs: 0, timeoutMs: 100 });
  assert.ok(primaryRequests >= 2);
});

test("runs trajectory, faithfulness, and correctness evaluators with ground truth", async () => {
  const inputs: Array<Record<string, unknown>> = [];
  const client = {
    async send(command: { input: Record<string, unknown> }) {
      inputs.push(command.input);
      return {
        evaluationResults: [{
          context: { spanContext: { sessionId: "session-1" } },
          evaluatorArn: "arn",
          evaluatorId: command.input.evaluatorId,
          evaluatorName: command.input.evaluatorId,
          label: "Pass",
          value: 1,
        }],
      };
    },
  } as unknown as BedrockAgentCoreClient;

  const results = await evaluateCase(client, fixture, "session-1", [{
    attributes: { "aws.operation.name": "InvokeAgentRuntime", "session.id": "session-1" },
    spanId: "platform-span",
    traceId: "platform-trace",
  }, {
    attributes: {
      "agentic_basics.role": "coordinator",
      "openinference.span.kind": "AGENT",
      "output.value": "done",
      "session.id": "session-1",
    },
    spanId: "agent-span",
    traceId: "trace-1",
  }, {
    attributes: { "openinference.span.kind": "TOOL", "tool.name": "delegate_order_investigator" },
    parentSpanId: "agent-span",
    spanId: "tool-span",
    traceId: "trace-1",
  }, {
    attributes: {
      "agentic_basics.role": "order-investigator",
      "openinference.span.kind": "AGENT",
      "output.value": "specialist answer",
      "session.id": "session-1",
    },
    parentSpanId: "tool-span",
    spanId: "specialist-span",
    traceId: "trace-1",
  }, {
    attributes: { "openinference.span.kind": "TOOL", "tool.name": "Read" },
    parentSpanId: "specialist-span",
    spanId: "read-span",
    traceId: "trace-1",
  }, {
    body: { output: "specialist output" },
    spanId: "specialist-span",
    traceId: "trace-1",
  }]);
  assert.equal(results.length, 3);
  assert.deepEqual(inputs.map(({ evaluatorId }) => evaluatorId), [
    "Builtin.TrajectoryExactOrderMatch",
    "Builtin.Faithfulness",
    "Builtin.Correctness",
  ]);
  assert.equal(inputs[0]?.evaluationTarget, undefined);
  assert.deepEqual(inputs[1]?.evaluationTarget, { traceIds: ["trace-1"] });
  assert.deepEqual(inputs[2]?.evaluationTarget, { traceIds: ["trace-1"] });
  assert.match(JSON.stringify(inputs[0]?.evaluationReferenceInputs), /delegate_order_investigator/);
  assert.equal(inputs[1]?.evaluationReferenceInputs, undefined);
  assert.match(JSON.stringify(inputs[2]?.evaluationReferenceInputs), /verified answer/);
  for (const input of inputs) {
    const serialized = JSON.stringify(input.evaluationInput);
    assert.doesNotMatch(serialized, /platform-trace|specialist-span|read-span|specialist output/);
    assert.match(serialized, /agent-span/);
    assert.match(serialized, /tool-span/);
  }
});

test("selects a completed AGENT trace for the requested session", () => {
  const documents = [{
    attributes: { "aws.operation.name": "InvokeAgentRuntime", "session.id": "session-1" },
    spanId: "platform-span",
    traceId: "platform-trace",
  }, {
    attributes: {
      "agentic_basics.role": "policy-specialist",
      "openinference.span.kind": "AGENT",
      "output.value": "wrong session",
      "session.id": "session-2",
    },
    spanId: "other-agent-span",
    traceId: "other-agent-trace",
  }, {
    attributes: {
      "agentic_basics.role": "coordinator",
      "openinference.span.kind": "AGENT",
      "output.value": "done",
      "session.id": "session-1",
    },
    spanId: "agent-span",
    traceId: "agent-trace",
  }];

  assert.equal(findTraceId(documents, "session-1"), "agent-trace");
});

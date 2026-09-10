import { readFile } from "node:fs/promises";

import {
  FilterLogEventsCommand,
  type CloudWatchLogsClient,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  EvaluateCommand,
  type BedrockAgentCoreClient,
  type EvaluationInput,
  type EvaluationReferenceInput,
  type EvaluationResultContent,
} from "@aws-sdk/client-bedrock-agentcore";

export interface EvaluationCase {
  expectedResponse: string;
  expectedTools: string[];
  id: string;
  prompt: string;
  trajectoryEvaluator: "Builtin.TrajectoryAnyOrderMatch" | "Builtin.TrajectoryExactOrderMatch";
}

export async function loadEvaluationCases(path: string): Promise<EvaluationCase[]> {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(value)) throw new Error("Evaluation cases must be an array.");
  return value.map(parseCase);
}

export async function collectSessionSpans(
  client: CloudWatchLogsClient,
  logGroupName: string,
  sessionId: string,
  startTime: number,
  options: {
    onProgress?: (message: string) => void;
    pollMs?: number;
    progressMs?: number;
    timeoutMs?: number;
  } = {},
): Promise<Record<string, unknown>[]> {
  const locations = [
    { group: logGroupName, stream: "spans" },
    { group: "aws/spans", stream: "default" },
  ].filter((location, index, values) =>
    values.findIndex((other) => other.group === location.group && other.stream === location.stream) === index
  );
  const timeoutMs = options.timeoutMs ?? 600_000;
  const deadline = Date.now() + timeoutMs;
  let nextProgress = Date.now() + (options.progressMs ?? 30_000);
  const documents = new Map<string, Record<string, unknown>>();
  const unavailable = new Set<string>();
  do {
    for (const location of locations) {
      if (unavailable.has(location.group)) continue;
      try {
        await collectLogEvents(client, location.group, location.stream, `"${sessionId}"`, startTime, documents);
      } catch (error) {
        if (!isMissingLogGroup(error)) throw error;
        unavailable.add(location.group);
      }
    }

    const spans = [...documents.values()].filter(isSpan);
    const traceIds = new Set(spans.map(traceIdOf).filter(isString));
    for (const traceId of traceIds) {
      try {
        await collectLogEvents(client, logGroupName, "otel-rt-logs", `"${traceId}"`, startTime, documents);
      } catch (error) {
        if (!isMissingLogGroup(error)) throw error;
      }
    }

    if (hasEvaluableAgentSpan([...documents.values()], sessionId)) return [...documents.values()];
    if (Date.now() >= nextProgress) {
      options.onProgress?.(
        `Waiting for telemetry: ${spans.length} span(s), ${documents.size - spans.length} event(s) found.`,
      );
      nextProgress = Date.now() + (options.progressMs ?? 30_000);
    }
    await delay(options.pollMs ?? 5_000);
  } while (Date.now() < deadline);
  const searched = locations.map(({ group, stream }) => `${group}/${stream}`).concat(`${logGroupName}/otel-rt-logs`);
  const spans = [...documents.values()].filter(isSpan).length;
  throw new Error(
    `No complete evaluable AGENT span for session ${sessionId} appeared within ${Math.round(timeoutMs / 1000)} seconds. `
    + `Searched ${searched.join(", ")}; found ${spans} span(s) and ${documents.size - spans} event(s).`,
  );
}

async function collectLogEvents(
  client: CloudWatchLogsClient,
  logGroupName: string,
  logStreamNamePrefix: string,
  filterPattern: string,
  startTime: number,
  documents: Map<string, Record<string, unknown>>,
): Promise<void> {
  let nextToken: string | undefined;
  const seenTokens = new Set<string>();
  do {
    const response = await client.send(new FilterLogEventsCommand({
      filterPattern,
      logGroupName,
      logStreamNamePrefix,
      startTime,
      ...(nextToken ? { nextToken } : {}),
    }));
    for (const event of response.events ?? []) {
      if (!event.message) continue;
      const value = parseJson(event.message);
      if (!isRecord(value)) continue;
      const key = event.eventId ?? `${logGroupName}:${event.logStreamName ?? logStreamNamePrefix}:${event.timestamp ?? ""}:${event.message}`;
      documents.set(key, value);
    }
    nextToken = response.nextToken && !seenTokens.has(response.nextToken)
      ? response.nextToken
      : undefined;
    if (nextToken) seenTokens.add(nextToken);
  } while (nextToken);
}

function hasEvaluableAgentSpan(documents: Record<string, unknown>[], sessionId: string): boolean {
  return findTraceId(documents, sessionId) !== undefined;
}

function isAgentSpan(value: Record<string, unknown>): boolean {
  return isSpan(value)
    && isRecord(value.attributes)
    && value.attributes["openinference.span.kind"] === "AGENT";
}

function isSpan(value: Record<string, unknown>): boolean {
  return traceIdOf(value) !== undefined
    && spanIdOf(value) !== undefined
    && "attributes" in value;
}

function traceIdOf(value: Record<string, unknown>): string | undefined {
  return firstString(value, ["traceId", "trace_id", "trace_id_hex"]);
}

function spanIdOf(value: Record<string, unknown>): string | undefined {
  return firstString(value, ["spanId", "span_id", "span_id_hex"]);
}

function firstString(value: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof value[key] === "string") return value[key];
  }
  return undefined;
}

function isMissingLogGroup(error: unknown): boolean {
  return isRecord(error) && error.name === "ResourceNotFoundException";
}

export async function evaluateCase(
  client: BedrockAgentCoreClient,
  fixture: EvaluationCase,
  sessionId: string,
  spans: Record<string, unknown>[],
): Promise<EvaluationResultContent[]> {
  const traceId = findTraceId(spans, sessionId);
  if (!traceId) throw new Error(`No completed AGENT trace found for session ${sessionId}.`);
  const evaluationSpans = projectCoordinatorTrace(spans, sessionId);
  const trajectoryReference: EvaluationReferenceInput = {
    context: { spanContext: { sessionId } },
    expectedTrajectory: { toolNames: fixture.expectedTools },
  };
  const correctnessReference: EvaluationReferenceInput = {
    context: { spanContext: { sessionId, traceId } },
    expectedResponse: { text: fixture.expectedResponse },
  };

  const evaluatorIds = [fixture.trajectoryEvaluator, "Builtin.Faithfulness", "Builtin.Correctness"];
  const results: EvaluationResultContent[] = [];
  for (const evaluatorId of evaluatorIds) {
    const isSessionEvaluator = evaluatorId.startsWith("Builtin.Trajectory");
    const references = isSessionEvaluator
      ? [trajectoryReference]
      : evaluatorId === "Builtin.Correctness"
        ? [correctnessReference]
        : undefined;
    const response = await client.send(new EvaluateCommand({
      evaluatorId,
      evaluationInput: {
        sessionSpans: evaluationSpans as unknown as EvaluationInput.SessionSpansMember["sessionSpans"],
      },
      ...(references ? { evaluationReferenceInputs: references } : {}),
      ...(!isSessionEvaluator ? { evaluationTarget: { traceIds: [traceId] } } : {}),
    }));
    results.push(...(response.evaluationResults ?? []));
  }
  return results;
}

export function findTraceId(documents: Record<string, unknown>[], sessionId: string): string | undefined {
  for (const span of documents) {
    if (!isCoordinatorAgentSpan(span) || sessionIdOf(span) !== sessionId || !hasOutput(span, documents)) continue;
    const traceId = traceIdOf(span);
    if (traceId) return traceId;
  }
  return undefined;
}

function projectCoordinatorTrace(
  documents: Record<string, unknown>[],
  sessionId: string,
): Record<string, unknown>[] {
  const coordinator = documents.find((document) =>
    isCoordinatorAgentSpan(document)
    && sessionIdOf(document) === sessionId
    && hasOutput(document, documents)
  );
  if (!coordinator) return [];

  const traceId = traceIdOf(coordinator);
  const coordinatorSpanId = spanIdOf(coordinator);
  if (!traceId || !coordinatorSpanId) return [];

  const traceSpans = documents.filter((document) => isSpan(document) && traceIdOf(document) === traceId);
  const includedSpanIds = new Set([coordinatorSpanId]);
  for (const span of traceSpans) {
    if (isDelegationSpan(span)) {
      const spanId = spanIdOf(span);
      if (spanId) includedSpanIds.add(spanId);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const span of traceSpans) {
      const spanId = spanIdOf(span);
      const parentSpanId = parentSpanIdOf(span);
      if (
        !spanId
        || !parentSpanId
        || includedSpanIds.has(spanId)
        || !includedSpanIds.has(parentSpanId)
        || isAgentSpan(span)
      ) continue;
      includedSpanIds.add(spanId);
      changed = true;
    }
  }

  return documents.filter((document) =>
    traceIdOf(document) === traceId
    && includedSpanIds.has(spanIdOf(document) ?? "")
  );
}

function isCoordinatorAgentSpan(value: Record<string, unknown>): boolean {
  return isAgentSpan(value)
    && isRecord(value.attributes)
    && value.attributes["agentic_basics.role"] === "coordinator";
}

function isDelegationSpan(value: Record<string, unknown>): boolean {
  return isRecord(value.attributes)
    && value.attributes["openinference.span.kind"] === "TOOL"
    && typeof value.attributes["tool.name"] === "string"
    && value.attributes["tool.name"].startsWith("delegate_");
}

function sessionIdOf(value: Record<string, unknown>): string | undefined {
  return isRecord(value.attributes) && typeof value.attributes["session.id"] === "string"
    ? value.attributes["session.id"]
    : undefined;
}

function parentSpanIdOf(value: Record<string, unknown>): string | undefined {
  return firstString(value, ["parentSpanId", "parent_span_id", "parent_span_id_hex"]);
}

function hasOutput(span: Record<string, unknown>, documents: Record<string, unknown>[]): boolean {
  if (isRecord(span.attributes) && typeof span.attributes["output.value"] === "string") return true;
  const traceId = traceIdOf(span);
  const spanId = spanIdOf(span);
  return documents.some((document) =>
    traceIdOf(document) === traceId
    && spanIdOf(document) === spanId
    && isRecord(document.body)
    && "output" in document.body
  );
}

function parseCase(value: unknown): EvaluationCase {
  if (!isRecord(value)) throw new Error("Each evaluation case must be an object.");
  const allowed = ["Builtin.TrajectoryAnyOrderMatch", "Builtin.TrajectoryExactOrderMatch"];
  if (
    typeof value.id !== "string" || !value.id
    || typeof value.prompt !== "string" || !value.prompt
    || typeof value.expectedResponse !== "string" || !value.expectedResponse
    || !Array.isArray(value.expectedTools) || !value.expectedTools.every((item) => typeof item === "string")
    || typeof value.trajectoryEvaluator !== "string" || !allowed.includes(value.trajectoryEvaluator)
  ) throw new Error("An evaluation case has invalid or missing fields.");
  return value as unknown as EvaluationCase;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: string | undefined): value is string {
  return value !== undefined;
}

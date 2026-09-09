import { randomUUID } from "node:crypto";

import {
  ClientFactory,
  ClientFactoryOptions,
  DefaultAgentCardResolver,
  JsonRpcTransportFactory,
} from "@a2a-js/sdk/client";
import { TaskState } from "@a2a-js/sdk";
import {
  BedrockAgentCoreClient,
  GetAgentCardCommand,
  InvokeAgentRuntimeCommand,
  type GetAgentCardCommandInput,
  type InvokeAgentRuntimeCommandInput,
} from "@aws-sdk/client-bedrock-agentcore";

import { createUserMessage, textFromResult, textFromUnknownResult } from "./a2a.js";
import { tracesFromUnknown, type TraceSink } from "./trace.js";

export interface AgentCardInfo {
  description: string;
  name: string;
  skills: Array<{ description: string; id: string; name: string }>;
}

export interface DiscoveredAgent {
  card: AgentCardInfo;
  sessionId: string;
  target: string;
}

export interface A2ATransport {
  discover(target: string): Promise<DiscoveredAgent>;
  send(agent: DiscoveredAgent, text: string, onTrace?: TraceSink): Promise<string>;
}

export interface TransportOptions {
  agentCoreClient?: BedrockAgentCoreClient;
  fetchImpl?: typeof fetch;
  region: string;
  runtimeUserId: string;
}

export function createA2ATransport(options: TransportOptions): A2ATransport {
  const awsClient = options.agentCoreClient ?? new BedrockAgentCoreClient({ region: options.region });
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async discover(target) {
      if (isAgentCoreArn(target)) {
        const sessionId = randomUUID();
        const response = await withConflictRetry(() => awsClient.send(new GetAgentCardCommand(
          createAgentCardInput(target, sessionId),
        )));
        if (!response.agentCard) throw new Error(`AgentCore returned no Agent Card for ${target}.`);
        return { card: cardInfo(response.agentCard), sessionId, target };
      }

      const card = await new DefaultAgentCardResolver({ fetchImpl }).resolve(target);
      return { card: cardInfo(card), sessionId: randomUUID(), target };
    },

    async send(agent, text, onTrace = () => {}) {
      if (isAgentCoreArn(agent.target)) {
        const response = await withConflictRetry(() => awsClient.send(new InvokeAgentRuntimeCommand(
          createAgentCoreInvocationInput(agent, text, options.runtimeUserId, true),
        )));
        if (!response.response) throw new Error(`AgentCore returned no response for ${agent.card.name}.`);
        return consumeAgentCoreStream(response.response, onTrace);
      }

      const factory = new ClientFactory(ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
        cardResolver: new DefaultAgentCardResolver({ fetchImpl }),
        transports: [new JsonRpcTransportFactory({ fetchImpl })],
      }));
      const client = await factory.createFromUrl(agent.target);
      const stream = client.sendMessageStream({
        tenant: "",
        message: createUserMessage(text),
        configuration: undefined,
        metadata: undefined,
      });
      let finalText: string | undefined;
      let failure: string | undefined;
      for await (const event of stream) {
        for (const trace of tracesFromUnknown(event)) {
          onTrace(trace);
          if (trace.isError) failure = trace.message;
        }
        const payload = event.payload;
        if (payload?.$case === "artifactUpdate" && payload.value.artifact) {
          finalText = textFromUnknownResult(payload.value.artifact);
        }
        if (payload?.$case === "message") finalText = textFromResult(payload.value);
        if (payload?.$case === "task" && payload.value.status?.state === TaskState.TASK_STATE_COMPLETED) {
          finalText = textFromResult(payload.value);
        }
      }
      if (!finalText) throw new Error(failure || `A2A agent ${agent.card.name} returned no final text.`);
      return finalText;
    },
  };
}

export function createAgentCardInput(
  agentRuntimeArn: string,
  sessionId: string,
): GetAgentCardCommandInput {
  return {
    agentRuntimeArn,
    qualifier: "DEFAULT",
    runtimeSessionId: sessionId,
  };
}

export function createAgentCoreInvocationInput(
  agent: DiscoveredAgent,
  text: string,
  runtimeUserId: string,
  streaming = false,
): InvokeAgentRuntimeCommandInput {
  return {
    accept: streaming ? "text/event-stream" : "application/json",
    agentRuntimeArn: agent.target,
    contentType: "application/json",
    payload: Buffer.from(JSON.stringify(createLegacyRequest(text, streaming))),
    qualifier: "DEFAULT",
    runtimeSessionId: agent.sessionId,
    runtimeUserId,
  };
}

export async function withConflictRetry<T>(
  operation: () => Promise<T>,
  wait: (milliseconds: number) => Promise<void> = delay,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === 2 || !isRetryableConflict(error)) throw error;
      await wait(100 * 2 ** attempt);
    }
  }
  throw new Error("Unreachable retry state.");
}

function createLegacyRequest(text: string, streaming = false): unknown {
  return {
    jsonrpc: "2.0",
    id: randomUUID(),
    method: streaming ? "message/stream" : "message/send",
    params: {
      message: {
        kind: "message",
        messageId: randomUUID(),
        role: "user",
        parts: [{ kind: "text", text }],
      },
    },
  };
}

async function consumeAgentCoreStream(body: unknown, onTrace: TraceSink): Promise<string> {
  let finalText: string | undefined;
  let failure: string | undefined;
  for await (const value of parseResponseValues(body)) {
    if (isRecord(value) && isRecord(value.error)) {
      throw new Error(String(value.error.message || "A2A invocation failed."));
    }
    for (const trace of tracesFromUnknown(value)) {
      onTrace(trace);
      if (trace.isError) failure = trace.message;
    }
    const result = isRecord(value) && "result" in value ? value.result : value;
    const text = finalTextFromUnknown(result);
    if (text) finalText = text;
  }
  if (!finalText) throw new Error(failure || "AgentCore returned no final A2A text.");
  return finalText;
}

async function* parseResponseValues(body: unknown): AsyncGenerator<unknown> {
  let content = "";
  const decoder = new TextDecoder();
  if (isAsyncIterable(body)) {
    for await (const chunk of body) {
      content += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      const parsed = drainSse(content);
      content = parsed.remainder;
      for (const value of parsed.values) yield value;
    }
    content += decoder.decode();
  } else if (isRecord(body) && typeof body.transformToString === "function") {
    content = await (body.transformToString as () => Promise<string>)();
  } else {
    throw new Error("AgentCore returned an unsupported response stream.");
  }

  const parsed = drainSse(`${content}\n\n`);
  for (const value of parsed.values) yield value;
  if (parsed.values.length === 0 && content.trim()) yield JSON.parse(content);
}

function drainSse(content: string): { remainder: string; values: unknown[] } {
  const normalized = content.replaceAll("\r\n", "\n");
  const blocks = normalized.split("\n\n");
  const remainder = blocks.pop() || "";
  const values = blocks.flatMap((block): unknown[] => {
    const data = block.split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return [];
    return [JSON.parse(data)];
  });
  return { remainder, values };
}

function finalTextFromUnknown(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const artifact = isRecord(value.artifact) ? value.artifact : undefined;
  if (artifact) return textFromUnknownResult(artifact);
  if (Array.isArray(value.artifacts) && value.artifacts.length > 0) {
    return textFromUnknownResult({ artifacts: value.artifacts });
  }
  for (const key of ["payload", "value"]) {
    const text = finalTextFromUnknown(value[key]);
    if (text) return text;
  }
  return undefined;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array | string> {
  return typeof value === "object" && value !== null && Symbol.asyncIterator in value;
}

function cardInfo(value: unknown): AgentCardInfo {
  if (!isRecord(value)) throw new Error("Agent Card must be an object.");
  const name = requiredString(value.name, "Agent Card name");
  const description = requiredString(value.description, "Agent Card description");
  const rawSkills = Array.isArray(value.skills) ? value.skills : [];
  const skills = rawSkills.filter(isRecord).map((skill) => ({
    id: requiredString(skill.id, `${name} skill id`),
    name: requiredString(skill.name, `${name} skill name`),
    description: requiredString(skill.description, `${name} skill description`),
  }));
  if (skills.length === 0) throw new Error(`${name} does not advertise any skills.`);
  return { name, description, skills };
}

function isAgentCoreArn(value: string): boolean {
  if (value.startsWith("arn:aws:bedrock-agentcore:")) return true;
  try {
    new URL(value);
    return false;
  } catch {
    throw new Error(`A2A target must be an HTTP URL or AgentCore runtime ARN: ${value}`);
  }
}

function isRetryableConflict(error: unknown): boolean {
  if (!isRecord(error)) return false;
  if (error.name === "RetryableConflictException") return true;
  return isRecord(error.$metadata) && error.$metadata.httpStatusCode === 409;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${name} is required.`);
  return value;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

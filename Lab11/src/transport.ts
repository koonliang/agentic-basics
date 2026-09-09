import { randomUUID } from "node:crypto";

import {
  ClientFactory,
  ClientFactoryOptions,
  DefaultAgentCardResolver,
  JsonRpcTransportFactory,
} from "@a2a-js/sdk/client";
import {
  BedrockAgentCoreClient,
  GetAgentCardCommand,
  InvokeAgentRuntimeCommand,
  type GetAgentCardCommandInput,
  type InvokeAgentRuntimeCommandInput,
} from "@aws-sdk/client-bedrock-agentcore";

import { createUserMessage, textFromResult, textFromUnknownResult } from "./a2a.js";

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
  send(agent: DiscoveredAgent, text: string): Promise<string>;
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

    async send(agent, text) {
      if (isAgentCoreArn(agent.target)) {
        const response = await withConflictRetry(() => awsClient.send(new InvokeAgentRuntimeCommand(
          createAgentCoreInvocationInput(agent, text, options.runtimeUserId),
        )));
        if (!response.response) throw new Error(`AgentCore returned no response for ${agent.card.name}.`);
        const body = JSON.parse(await response.response.transformToString()) as unknown;
        if (isRecord(body) && isRecord(body.error)) {
          throw new Error(String(body.error.message || "A2A invocation failed."));
        }
        if (!isRecord(body) || !("result" in body)) throw new Error("Invalid A2A JSON-RPC response.");
        return textFromUnknownResult(body.result);
      }

      const factory = new ClientFactory(ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
        cardResolver: new DefaultAgentCardResolver({ fetchImpl }),
        transports: [new JsonRpcTransportFactory({ fetchImpl })],
      }));
      const client = await factory.createFromUrl(agent.target);
      const result = await client.sendMessage({
        tenant: "",
        message: createUserMessage(text),
        configuration: undefined,
        metadata: undefined,
      });
      return textFromResult(result);
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
): InvokeAgentRuntimeCommandInput {
  return {
    accept: "application/json",
    agentRuntimeArn: agent.target,
    contentType: "application/json",
    payload: Buffer.from(JSON.stringify(createLegacyRequest(text))),
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

function createLegacyRequest(text: string): unknown {
  return {
    jsonrpc: "2.0",
    id: randomUUID(),
    method: "message/send",
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

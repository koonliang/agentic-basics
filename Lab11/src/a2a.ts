import { randomUUID } from "node:crypto";

import { Role, type AgentCard, type AgentSkill, type Message, type Part, type Task } from "@a2a-js/sdk";

import type { AgentRole } from "./config.js";

const roleDetails: Record<AgentRole, {
  name: string;
  description: string;
  skill: AgentSkill;
}> = {
  coordinator: {
    name: "Support Investigation Coordinator",
    description: "Discovers specialist agents, delegates support investigations, and synthesizes their evidence.",
    skill: createSkill(
      "investigate-support-case",
      "Investigate support case",
      "Coordinates order verification and refund-policy interpretation for customer support cases.",
      ["support", "orchestration"],
    ),
  },
  "order-investigator": {
    name: "Order Investigator",
    description: "Verifies case details against order records without interpreting policy.",
    skill: createSkill(
      "verify-order",
      "Verify order",
      "Checks case notes and order records for order status, delivery dates, and customer details.",
      ["orders", "verification"],
    ),
  },
  "policy-specialist": {
    name: "Refund Policy Specialist",
    description: "Finds and interprets the refund policy applicable to a support case.",
    skill: createSkill(
      "interpret-refund-policy",
      "Interpret refund policy",
      "Reads case notes and refund policies to explain eligibility and required evidence.",
      ["refunds", "policy"],
    ),
  },
};

export function createAgentCard(role: AgentRole, publicUrl: string): AgentCard {
  const details = roleDetails[role];
  const url = ensureTrailingSlash(publicUrl);

  return {
    name: details.name,
    description: details.description,
    supportedInterfaces: [
      { url, protocolBinding: "JSONRPC", tenant: "", protocolVersion: "1.0" },
      { url, protocolBinding: "JSONRPC", tenant: "", protocolVersion: "0.3" },
    ],
    provider: undefined,
    version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false, extensions: [] },
    securitySchemes: {},
    securityRequirements: [],
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: [details.skill],
    signatures: [],
  };
}

export function createUserMessage(text: string): Message {
  return {
    messageId: randomUUID(),
    contextId: "",
    taskId: "",
    role: Role.ROLE_USER,
    parts: [textPart(text)],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  };
}

export function createAgentMessage(text: string, contextId: string): Message {
  return {
    messageId: randomUUID(),
    contextId,
    taskId: "",
    role: Role.ROLE_AGENT,
    parts: [textPart(text)],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  };
}

export function textFromMessage(message: Message): string {
  return message.parts.flatMap((part) =>
    part.content?.$case === "text" ? [part.content.value] : []
  ).join("\n").trim();
}

export function textFromResult(result: Message | Task): string {
  if ("parts" in result) return textFromMessage(result);

  const artifactText = result.artifacts.flatMap((artifact) => artifact.parts)
    .flatMap((part) => part.content?.$case === "text" ? [part.content.value] : [])
    .join("\n").trim();
  if (artifactText) return artifactText;
  if (result.status?.message) return textFromMessage(result.status.message);
  throw new Error("The A2A agent returned no text.");
}

export function textFromUnknownResult(value: unknown): string {
  const texts: string[] = [];
  collectText(value, texts);
  const result = texts.join("\n").trim();
  if (!result) throw new Error("The A2A agent returned no text.");
  return result;
}

function collectText(value: unknown, texts: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, texts);
    return;
  }
  if (!isRecord(value)) return;

  if (value.kind === "text" && typeof value.text === "string") texts.push(value.text);
  if (isRecord(value.content) && value.content.$case === "text" && typeof value.content.value === "string") {
    texts.push(value.content.value);
  }

  for (const key of ["parts", "artifacts", "history", "message", "payload"]) {
    collectText(value[key], texts);
  }
}

function createSkill(id: string, name: string, description: string, tags: string[]): AgentSkill {
  return {
    id,
    name,
    description,
    tags,
    examples: [],
    inputModes: ["text/plain"],
    outputModes: ["text/plain"],
    securityRequirements: [],
  };
}

function textPart(text: string): Part {
  return {
    content: { $case: "text", value: text },
    metadata: undefined,
    filename: "",
    mediaType: "text/plain",
  };
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

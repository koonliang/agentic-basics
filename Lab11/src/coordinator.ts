import Anthropic from "@anthropic-ai/sdk";

import type { A2ATransport, DiscoveredAgent } from "./transport.js";

export interface GatewayCredential {
  apiKey: string;
  baseUrl: string;
}

export interface SpecialistTarget {
  id: "order-investigator" | "policy-specialist";
  target: string;
}

export interface Delegation {
  id: SpecialistTarget["id"];
  task: string;
}

export interface RoutingDecision {
  delegations: Delegation[];
  directAnswer?: string;
}

export interface SpecialistResult {
  id: SpecialistTarget["id"];
  result: string;
  success: boolean;
}

export interface CoordinatorModel {
  route(prompt: string, agents: Array<{ agent: DiscoveredAgent; id: SpecialistTarget["id"] }>): Promise<RoutingDecision>;
  synthesize(prompt: string, results: SpecialistResult[]): Promise<string>;
}

export interface CoordinatorInput {
  model: CoordinatorModel;
  prompt: string;
  targets: SpecialistTarget[];
  transport: A2ATransport;
}

export async function coordinate(input: CoordinatorInput): Promise<string> {
  const agents = await Promise.all(input.targets.map(async (target) => ({
    agent: await input.transport.discover(target.target),
    id: target.id,
  })));
  const decision = await input.model.route(input.prompt, agents);
  if (decision.delegations.length === 0) {
    if (decision.directAnswer) return decision.directAnswer;
    throw new Error("The coordinator selected no specialist and returned no answer.");
  }

  const uniqueDelegations = deduplicate(decision.delegations);
  const settled = await Promise.allSettled(uniqueDelegations.map(async (delegation) => {
    const selected = agents.find((entry) => entry.id === delegation.id);
    if (!selected) throw new Error(`Unknown specialist: ${delegation.id}`);
    return input.transport.send(selected.agent, delegation.task);
  }));

  const results = settled.map((result, index): SpecialistResult => {
    const delegation = uniqueDelegations[index];
    if (!delegation) throw new Error("Missing delegation result.");
    return result.status === "fulfilled"
      ? { id: delegation.id, result: result.value, success: true }
      : { id: delegation.id, result: errorMessage(result.reason), success: false };
  });

  return input.model.synthesize(input.prompt, results);
}

export function createClaudeCoordinatorModel(
  model: string,
  gateway: GatewayCredential,
): CoordinatorModel {
  const client = new Anthropic({ apiKey: gateway.apiKey, baseURL: gateway.baseUrl });

  return {
    async route(prompt, agents) {
      const toolToId = new Map<string, SpecialistTarget["id"]>();
      const tools: Anthropic.Messages.Tool[] = agents.map(({ agent, id }) => {
        const name = id === "order-investigator"
          ? "delegate_order_investigator"
          : "delegate_policy_specialist";
        toolToId.set(name, id);
        return {
          name,
          description: `${agent.card.description} Skills: ${agent.card.skills.map((skill) => skill.description).join(" ")}`,
          input_schema: {
            type: "object",
            properties: {
              task: { type: "string", description: "A self-contained task for this specialist." },
            },
            required: ["task"],
            additionalProperties: false,
          },
        };
      });

      const response = await client.messages.create({
        model,
        max_tokens: 1_024,
        system: [
          "You coordinate customer support investigations.",
          "Select only the specialists needed for the request.",
          "When multiple specialists are needed, request all tools in this one response so they can run concurrently.",
          "If the user explicitly requests both specialists, call both.",
          "Give each specialist a self-contained task including the case path.",
        ].join(" "),
        messages: [{ role: "user", content: prompt }],
        tools,
      });

      const delegations: Delegation[] = [];
      const directText: string[] = [];
      for (const block of response.content) {
        if (block.type === "text") directText.push(block.text);
        if (block.type !== "tool_use") continue;
        const id = toolToId.get(block.name);
        const task = isRecord(block.input) && typeof block.input.task === "string"
          ? block.input.task.trim()
          : "";
        if (id && task) delegations.push({ id, task });
      }
      const directAnswer = directText.join("\n").trim();
      return {
        delegations,
        ...(directAnswer ? { directAnswer } : {}),
      };
    },

    async synthesize(prompt, results) {
      const evidence = results.map((result) => [
        `Specialist: ${result.id}`,
        `Status: ${result.success ? "success" : "failed"}`,
        result.result,
      ].join("\n")).join("\n\n");
      const response = await client.messages.create({
        model,
        max_tokens: 2_048,
        system: [
          "Synthesize specialist evidence into a customer support investigation.",
          "Use the headings Verified facts, Applicable policy, and Recommendation.",
          "Cite relative paths, disclose failed specialists or missing evidence, and do not invent facts.",
        ].join(" "),
        messages: [{
          role: "user",
          content: `Original request:\n${prompt}\n\nSpecialist results:\n${evidence}`,
        }],
      });
      const text = response.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("\n").trim();
      if (!text) throw new Error("The coordinator produced no final text.");
      return text;
    },
  };
}

function deduplicate(delegations: Delegation[]): Delegation[] {
  const seen = new Set<Delegation["id"]>();
  return delegations.filter((delegation) => {
    if (seen.has(delegation.id)) return false;
    seen.add(delegation.id);
    return true;
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

import type { Server } from "node:http";

import { TaskState } from "@a2a-js/sdk";
import { AgentEvent, DefaultRequestHandler, InMemoryTaskStore, STATE_HEADERS_KEY, type AgentExecutor, type RequestHeaders } from "@a2a-js/sdk/server";
import { agentCardHandler, jsonRpcHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import express, { type Express } from "express";

import {
  createAgentCard,
  createFinalArtifact,
  createTerminalStatus,
  createTraceStatus,
  createWorkingTask,
  textFromMessage,
} from "./a2a.js";
import { coordinate, createClaudeCoordinatorModel, type GatewayCredential } from "./coordinator.js";
import type { Config } from "./config.js";
import { resolveGatewayApiKey } from "./credentials.js";
import { runSpecialist } from "./specialist.js";
import { createA2ATransport } from "./transport.js";
import { withAgentSpan } from "./observability.js";
import { createTrace, logTrace, type TraceSink } from "./trace.js";

export interface ExecutionContext {
  headers: Record<string, string>;
  sessionId: string;
  workloadAccessToken?: string;
}

export type RoleRunner = (
  prompt: string,
  execution: ExecutionContext,
  onTrace?: TraceSink,
) => Promise<string>;

export function createRoleRunner(config: Config): RoleRunner {
  const transport = createA2ATransport({
    region: config.region,
    runtimeUserId: config.runtimeUserId,
  });

  return async (prompt, execution, onTrace = () => {}) => {
    const emit: TraceSink = (event) => {
      if (event.source === config.role) logTrace(event, execution.sessionId);
      onTrace(event);
    };
    const apiKey = await resolveGatewayApiKey({
      providerName: config.credentialProviderName,
      ...(config.localApiKey ? { localApiKey: config.localApiKey } : {}),
      ...(execution.workloadAccessToken ? { workloadAccessToken: execution.workloadAccessToken } : {}),
    });
    const gateway: GatewayCredential = { apiKey, baseUrl: config.baseUrl };

    if (config.role === "coordinator") {
      if (!config.orderAgentTarget || !config.policyAgentTarget) {
        throw new Error("Coordinator specialist targets are missing.");
      }
      return coordinate({
        model: createClaudeCoordinatorModel(config.model, gateway),
        prompt,
        targets: [
          { id: "order-investigator", target: config.orderAgentTarget },
          { id: "policy-specialist", target: config.policyAgentTarget },
        ],
        transport,
        onTrace: emit,
      });
    }

    return runSpecialist(config.role, prompt, config.workspace, config.model, gateway, emit);
  };
}

export function createApp(config: Config, runRole: RoleRunner = createRoleRunner(config)): Express {
  const card = createAgentCard(config.role, config.publicUrl);
  let activeExecutions = 0;
  const executor: AgentExecutor = {
    async execute(requestContext, eventBus) {
      const prompt = textFromMessage(requestContext.userMessage);
      if (!prompt) throw new Error("A2A message must contain a non-empty text part.");
      const { taskId, contextId } = requestContext;
      const headers = normalizedHeaders(requestContext.context.state.get(STATE_HEADERS_KEY));
      const sessionId = sessionIdFromBaggage(headers.baggage)
        || headerValue(headers, "x-amzn-bedrock-agentcore-runtime-session-id")
        || contextId;
      const accessToken = workloadToken(headers);
      eventBus.publish(AgentEvent.task(createWorkingTask(taskId, contextId)));
      activeExecutions += 1;
      try {
        const result = await withAgentSpan(
          config.role,
          prompt,
          sessionId,
          headers,
          () => runRole(
            prompt,
            {
              headers,
              sessionId,
              ...(accessToken ? { workloadAccessToken: accessToken } : {}),
            },
            (trace) => eventBus.publish(AgentEvent.statusUpdate(createTraceStatus(taskId, contextId, trace))),
          ),
        );
        eventBus.publish(AgentEvent.artifactUpdate(createFinalArtifact(taskId, contextId, result)));
        eventBus.publish(AgentEvent.statusUpdate(createTerminalStatus(
          taskId,
          contextId,
          TaskState.TASK_STATE_COMPLETED,
        )));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const trace = createTrace({ type: "error", source: config.role, isError: true, message });
        logTrace(trace, sessionId);
        eventBus.publish(AgentEvent.statusUpdate(createTraceStatus(taskId, contextId, trace)));
        eventBus.publish(AgentEvent.statusUpdate(createTerminalStatus(
          taskId,
          contextId,
          TaskState.TASK_STATE_FAILED,
          message,
        )));
      } finally {
        activeExecutions -= 1;
        eventBus.finished();
      }
    },
    async cancelTask() {
      throw new Error("Task cancellation is not supported in this lab.");
    },
  };
  const handler = new DefaultRequestHandler(card, new InMemoryTaskStore(), executor);
  const app = express();

  app.get("/ping", (_request, response) => response.json({
    status: activeExecutions > 0 ? "HealthyBusy" : "Healthy",
  }));
  app.use("/.well-known/agent-card.json", agentCardHandler({
    agentCardProvider: handler,
    legacyCompat: { enabled: true },
  }));
  app.use("/", jsonRpcHandler({
    requestHandler: handler,
    userBuilder: UserBuilder.noAuthentication,
    legacyCompat: { enabled: true },
  }));
  return app;
}

export function startServer(config: Config, app: Express = createApp(config)): Server {
  return app.listen(config.port, "0.0.0.0", () => {
    console.log(`${config.role} listening on http://0.0.0.0:${config.port}`);
  });
}

function workloadToken(headers: Record<string, string>): string | undefined {
  return Object.entries(headers).find(([name]) =>
    name.replaceAll("-", "") === "workloadaccesstoken"
  )?.[1];
}

function isHeaders(value: unknown): value is RequestHeaders {
  return typeof value === "object" && value !== null;
}

function normalizedHeaders(value: unknown): Record<string, string> {
  if (!isHeaders(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([name, header]) => {
    const text = Array.isArray(header) ? header[0] : header;
    return typeof text === "string" ? [[name.toLowerCase(), text]] : [];
  }));
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  return headers[name.toLowerCase()];
}

function sessionIdFromBaggage(value: string | undefined): string | undefined {
  const item = value?.split(",").map((part) => part.trim()).find((part) => part.startsWith("session.id="));
  if (!item) return undefined;
  const encoded = item.slice("session.id=".length).split(";")[0] ?? "";
  try {
    return decodeURIComponent(encoded) || undefined;
  } catch {
    return undefined;
  }
}

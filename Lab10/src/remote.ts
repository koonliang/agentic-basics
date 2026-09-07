import type { InvokeAgentRuntimeCommandInput } from "@aws-sdk/client-bedrock-agentcore";

export interface RemoteInvocation {
  agentRuntimeArn: string;
  prompt: string;
  sessionId: string;
  userId: string;
}

export function createInvocationInput(input: RemoteInvocation): InvokeAgentRuntimeCommandInput {
  return {
    agentRuntimeArn: input.agentRuntimeArn,
    qualifier: "DEFAULT",
    runtimeSessionId: input.sessionId,
    runtimeUserId: input.userId,
    contentType: "application/json",
    accept: "text/event-stream",
    payload: Buffer.from(JSON.stringify({ prompt: input.prompt })),
  };
}

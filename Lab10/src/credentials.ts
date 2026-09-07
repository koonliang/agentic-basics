import { withApiKey } from "bedrock-agentcore/identity";

export type IdentityApiKeyResolver = (
  providerName: string,
  workloadAccessToken: string,
) => Promise<string>;

export interface CredentialInput {
  identityResolver?: IdentityApiKeyResolver;
  localApiKey?: string;
  providerName: string;
  workloadAccessToken?: string;
}

export async function resolveGatewayApiKey(input: CredentialInput): Promise<string> {
  if (input.workloadAccessToken) {
    const resolver = input.identityResolver ?? getAgentCoreApiKey;
    return resolver(input.providerName, input.workloadAccessToken);
  }

  if (input.localApiKey) return input.localApiKey;

  throw new Error(
    "No gateway credential is available. Set ANTHROPIC_API_KEY locally or run in AgentCore Runtime with a workload access token.",
  );
}

async function getAgentCoreApiKey(
  providerName: string,
  workloadAccessToken: string,
): Promise<string> {
  const resolve = withApiKey({
    providerName,
    workloadIdentityToken: workloadAccessToken,
  })(async (apiKey: string) => apiKey);
  return resolve();
}

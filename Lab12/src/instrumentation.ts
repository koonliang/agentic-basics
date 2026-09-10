import * as ClaudeAgentSDK from "@anthropic-ai/claude-agent-sdk";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicInstrumentation } from "@arizeai/openinference-instrumentation-anthropic";
import { ClaudeAgentSDKInstrumentation } from "@arizeai/openinference-instrumentation-claude-agent-sdk";

new AnthropicInstrumentation().manuallyInstrument(Anthropic);
const instrumentedClaudeAgentSDK = new ClaudeAgentSDKInstrumentation().manuallyInstrument(ClaudeAgentSDK);

export { Anthropic };
export const query = instrumentedClaudeAgentSDK.query;

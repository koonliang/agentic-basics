import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";

export interface ModelResponse {
  content: Anthropic.Messages.ContentBlock[];
  stopReason: Anthropic.Messages.StopReason | null;
}

export interface ModelClient {
  create(request: MessageCreateParamsNonStreaming): Promise<ModelResponse>;
}

export class ClaudeClient implements ModelClient {
  private readonly client: Anthropic;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new Anthropic({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });
  }

  async create(request: MessageCreateParamsNonStreaming): Promise<ModelResponse> {
    const response = await this.client.messages.create(request);
    return {
      content: response.content,
      stopReason: response.stop_reason,
    };
  }
}

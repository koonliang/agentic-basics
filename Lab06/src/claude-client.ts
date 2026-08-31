import Anthropic from "@anthropic-ai/sdk";

import type { ModelClient, ModelRequest, ModelResponse } from "./types.js";

export class ClaudeClient implements ModelClient {
  private readonly client: Anthropic;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new Anthropic({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });
  }

  async create(request: ModelRequest): Promise<ModelResponse> {
    const response = await this.client.messages.create(
      request as Parameters<Anthropic["messages"]["create"]>[0],
    );

    if (!("content" in response)) {
      throw new Error("Streaming responses are not supported in this lab.");
    }

    return {
      content: response.content,
      stop_reason: response.stop_reason,
    };
  }
}

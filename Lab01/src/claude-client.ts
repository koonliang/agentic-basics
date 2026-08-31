import Anthropic from "@anthropic-ai/sdk";
import type {
  ModelClient,
  ModelRequest,
  ModelResponse,
} from "./types.js";

export class ClaudeClient implements ModelClient {
  private readonly client = new Anthropic();

  async create(request: ModelRequest): Promise<ModelResponse> {
    const response = await this.client.messages.create(
      request as Parameters<typeof this.client.messages.create>[0],
    );

    if (!("content" in response)) {
      throw new Error("Streaming responses are not supported by this client");
    }

    return {
      content: response.content,
      stop_reason: response.stop_reason,
    };
  }
}

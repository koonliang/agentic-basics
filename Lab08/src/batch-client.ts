import Anthropic from "@anthropic-ai/sdk";

import type { BatchResult } from "./types.js";

export class ClaudeBatchClient {
  private readonly client: Anthropic;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new Anthropic({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });
  }

  async create(requests: unknown[]) {
    return this.client.messages.batches.create({
      requests: requests as Parameters<Anthropic["messages"]["batches"]["create"]>[0]["requests"],
    });
  }

  async retrieve(batchId: string) {
    return this.client.messages.batches.retrieve(batchId);
  }

  async results(batchId: string): Promise<BatchResult[]> {
    const stream = await this.client.messages.batches.results(batchId);
    const results: BatchResult[] = [];
    for await (const item of stream) {
      results.push({ customId: item.custom_id, result: item.result });
    }
    return results;
  }
}

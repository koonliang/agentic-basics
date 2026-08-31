# Lab01 — Your First Tool-Using Agent

Build the core agent loop yourself using the Claude Messages API. Claude decides when to request a tool, but your Node.js application validates the request, runs the tool, and sends the result back.

## Learning objectives

By the end of this lab, you will be able to explain:

- Why a model does not directly execute a client tool.
- How a JSON Schema describes a tool contract.
- How `tool_use` and `tool_result` blocks form an agent loop.
- Why an agent needs error handling and a turn limit.
- Which parts are probabilistic and which parts remain deterministic application code.

## Architecture

```text
User prompt
    |
    v
Node.js agent loop ---- tool schema ----> Claude
    ^                                     |
    |                                     | tool_use
    |                                     v
Local orders.json <---- get_order_status handler
    |
    +------------ tool_result ----------> Claude
                                           |
                                           v
                                      Final answer
```

Claude only produces a structured request for this client tool. The `get_order_status` function executes locally and Claude never sees its source code.

## Prerequisites

- Node.js 22 or later
- npm 10 or later
- An Anthropic API key with API billing enabled

A Claude subscription does not include Anthropic API usage.

## Setup

From the repository root:

```bash
cp .env.example .env
cd Lab01
npm ci
```

Edit the root `.env` and replace the placeholder value:

```dotenv
ANTHROPIC_API_KEY=your-api-key
CLAUDE_MODEL=claude-haiku-4-5
```

The model can be changed without changing the source code.

## Run the demo

```bash
npm run demo -- "Where is order A1001?"
```

A typical trace looks like this:

```text
[model] turn=1 stop_reason=tool_use
[tool request] get_order_status {"order_id":"A1001"}
[tool result] {"id":"A1001",...}
[model] turn=2 stop_reason=end_turn

[assistant]
Order A1001 is in transit and is estimated to arrive on 2 September 2026.
```

Exact wording varies because model output is probabilistic. The tool result remains deterministic.

Available fixture orders are `A1001`, `A1002`, and `A1003`. Try an unknown order to see the tool error flow:

```bash
npm run demo -- "Where is order A9999?"
```

## Walkthrough

1. `src/agent.ts` sends the user message and the strict `get_order_status` schema to Claude.
2. Claude can answer directly or return a `tool_use` content block.
3. The application validates the tool name and `order_id`.
4. `src/orders.ts` looks up the order in `data/orders.json`.
5. The application sends a `tool_result` block whose `tool_use_id` matches Claude's request.
6. The loop repeats until Claude returns `end_turn` or reaches four turns.

Errors are returned to Claude with `is_error: true`. This gives the model a chance to explain the problem or choose another approach without crashing the process.

## Tests

The tests use a fake model client and make no API calls:

```bash
npm run typecheck
npm test
```

They cover successful tool use, malformed input, unknown tools, unknown orders, refusals, unexpected stops, and the maximum-turn limit.

## Experiments

1. Ask a question that does not require order data. Observe whether Claude calls the tool.
2. Change the tool description and see how it affects tool selection.
3. Ask for two orders in one prompt. The loop already handles multiple tool calls in one response.
4. Add a new fixture order and query it without changing the tool implementation.
5. Reduce `maxTurns` in `src/index.ts` and observe the safety stop.

## Troubleshooting

- **Missing API key:** confirm `.env` exists in the repository root and contains `ANTHROPIC_API_KEY`.
- **Unknown model:** set `CLAUDE_MODEL` to a model enabled for your Anthropic account.
- **Order not found:** use one of the fixture IDs or add an order to `data/orders.json`.
- **No tool call:** tool choice is model-controlled. Ask specifically for current order data.

## Key takeaway

An agent is not just an LLM call. It is a loop that combines a model, instructions, tool contracts, deterministic handlers, returned results, and explicit stopping conditions.

## Reference

- [How Claude tool use works](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works)

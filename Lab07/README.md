# Lab07 — Coordinate specialist subagents

Lab07 uses the Claude Agent SDK's native `Agent` tool to delegate one support investigation to two specialists. The coordinator receives their reports and synthesizes one recommendation.

This lab is self-contained. It reads a local workspace and does not require Lab05, MCP, or `.mcp.json`.

## Learning objectives

By the end of this lab, you will be able to explain:

- how the SDK's `agents` option defines specialist subagents;
- how the coordinator invokes specialists through the `Agent` tool;
- why each subagent starts with a fresh context;
- how tool restrictions differ between the coordinator and specialists;
- when independent specialist tasks can run in parallel; and
- how the coordinator synthesizes separate evidence without sharing full contexts.

## Architecture

```text
User support case
       |
       v
Coordinator agent
       |
       | Agent tool calls
       +---------------------------+
       |                           |
       v                           v
order-investigator          policy-specialist
Read / Glob / Grep          Read / Glob / Grep
       |                           |
       v                           v
case + order facts          applicable policy
       |                           |
       +-------------+-------------+
                     |
                     v
          coordinator synthesis
```

The coordinator is told to launch both specialists together when their work is independent. Agent invocation order is still a model decision, so exact ordering and parallelism can vary between runs.

## Specialists

| Agent | Responsibility | Tools |
| --- | --- | --- |
| Coordinator | Delegates and synthesizes | `Agent`, `Read`, `Glob`, `Grep` |
| `order-investigator` | Verifies case and order facts | `Read`, `Glob`, `Grep` |
| `policy-specialist` | Finds and interprets refund rules | `Read`, `Glob`, `Grep` |

The coordinator can technically see the filesystem tools because subagents receive a restricted subset of the parent's available tools. Its system instruction requires it to delegate instead of investigating directly. All exposed operations are read-only, and `permissionMode: "dontAsk"` denies anything not pre-approved.

## Fresh context and handoff

A subagent does not receive the coordinator's conversation history or previous tool results. It receives:

- its own specialist system prompt; and
- the task string supplied in the coordinator's `Agent` tool call.

The coordinator must therefore include the case path and requested evidence in each delegation prompt. The specialist's final response returns as the `Agent` tool result. The coordinator sees that report, not the specialist's entire working context.

## Setup

Requirements: Node.js 22 or later and an Anthropic-compatible API key.

From the repository root:

```bash
cp .env.example .env
cd Lab07
npm ci
```

Edit the root `.env`:

```dotenv
ANTHROPIC_API_KEY=your-key
CLAUDE_MODEL=claude-haiku-4-5
ANTHROPIC_BASE_URL=https://api.anthropic.com
```

Your custom gateway can be used if it supports the Claude Agent SDK and standard client-tool calls. The SDK process inherits these environment variables.

## Run the demo

Run the default damaged-item case:

```bash
npm run demo
```

Or provide another task:

```bash
npm run demo -- "Investigate cases/case-001.md and have both specialists recommend the next action"
```

A typical trace includes the coordinator's two Agent calls and each specialist's work:

```text
[sdk] available tools: Agent, Read, Glob, Grep
[coordinator tool] Agent {"description":"Verify order facts",...,"subagent_type":"order-investigator"}
[coordinator tool] Agent {"description":"Check refund policy",...,"subagent_type":"policy-specialist"}
[order-investigator tool] Read {"file_path":".../cases/case-001.md"}
[policy-specialist tool] Read {"file_path":".../policies/refunds.md"}
[subagent tool result] id=... error=false
...
[coordinator]
## Verified facts
...
[sdk] done success=true
```

Tool order and wording vary because Claude chooses the delegation and investigation path.

## Follow the orchestration

1. The application calls `query()` once with the coordinator prompt and options.
2. The coordinator sees two agent definitions and the `Agent` tool.
3. It sends a focused prompt to each specialist.
4. Each specialist runs in a fresh context with only read-only tools.
5. Each specialist returns a final report as an `Agent` tool result.
6. The coordinator compares both reports and produces the final response.

Unlike application-controlled orchestration, Node.js does not call `query()` three times or manually combine results. The coordinator model controls delegation inside one SDK-managed agent loop.

## Cost and safety

Subagents make their own model calls, so this lab generally consumes more tokens than a single-agent investigation. Both specialists inherit `CLAUDE_MODEL`, use at most five turns, and the coordinator uses at most eight turns.

Tool lists are capability restrictions at the Agent SDK level, not an operating-system sandbox. No specialist receives `Write`, `Edit`, or `Bash`, and no output files are created.

## Verify offline

```bash
npm test
npm run typecheck
```

The tests do not call Claude. They verify coordinator configuration, specialist definitions and restrictions, source-labeled stream events, and completion errors.

## Experiments

1. Remove one specialist requirement from the coordinator prompt and observe whether it still delegates twice.
2. Ask about an order without a support case and inspect what context each specialist receives.
3. Give the specialists conflicting instructions and see how the coordinator reports uncertainty.
4. Change one specialist to `model: "haiku"` while the coordinator uses another model.
5. Replace native Agent delegation with three application-controlled `query()` calls and compare determinism.

## Source map

- `src/agent.ts`: coordinator options, specialist definitions, and event extraction
- `src/index.ts`: one Agent SDK query and labeled trace output
- `workspace/`: local case, order, and policy evidence
- `test/agent.test.ts`: offline configuration and event tests

## References

- [Subagents in the Agent SDK](https://code.claude.com/docs/en/agent-sdk/subagents)
- [Agent SDK TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript)
- [How the Agent SDK loop works](https://code.claude.com/docs/en/agent-sdk/agent-loop)

# Lab03: Read-only Agent with the Claude Agent SDK

Labs 01–02 called the Messages API and implemented the tool loop in application code. Lab03 calls the Claude Agent SDK once with a task. The SDK manages the model turns, built-in tool calls, tool results, and stopping condition.

The demo is a customer-support investigator that can search and read a small workspace but cannot run commands or change files.

## Learning objectives

By the end of this lab, you will be able to explain:

- How `query()` runs an SDK-managed agent loop
- How the built-in `Read`, `Glob`, and `Grep` tools differ from custom tools
- Why `tools` and `allowedTools` have different purposes
- How `permissionMode: "dontAsk"` creates a non-interactive deny-by-default policy
- Why a working directory and isolated settings matter

## Architecture

```text
User task
   |
   v
Node.js calls query() once
   |
   v
Claude Agent SDK agent loop
   |-- Glob ---> workspace file discovery
   |-- Grep ---> workspace content search
   |-- Read ---> workspace file contents
   |
   v
Final support recommendation
```

Unlike Lab01, the Node.js application does not define handlers for these tools or send `tool_result` messages. The Agent SDK supplies and executes the built-in tools locally.

## Sample workspace

The agent investigates only the files under `workspace/`:

```text
workspace/
├── cases/case-001.md
├── orders.json
└── policies/refunds.md
```

The sample case concerns a damaged item from order `A1002`. Claude must find the order record and applicable policy before recommending a refund.

Because this workspace is intentionally small and its layout is part of the exercise, the system prompt tells the agent that cases are under `cases/`, order records are in `orders.json`, and policies are under `policies/`. Claude still decides whether to use `Read`, `Glob`, or `Grep`, but it should not spend turns guessing nonexistent directory structures.

## Setup

Requirements: Node.js 22 or later and an Anthropic-compatible API key.

From the repository root:

```bash
cp .env.example .env
cd Lab03
npm ci
```

Edit the root `.env`:

```dotenv
ANTHROPIC_API_KEY=your-key
ANTHROPIC_BASE_URL=https://api.anthropic.com
CLAUDE_MODEL=claude-haiku-4-5
```

The npm script loads the root `.env` into the Node.js process. The Agent SDK's bundled Claude Code process inherits those environment variables.

Your custom gateway can be used for this lab if it supports standard Anthropic Messages API client-tool calls. These built-in filesystem tools execute locally, so this lab does not require the Anthropic server-side web search capability that failed through the Bedrock-backed gateway in Lab02.

## Run the demo

Run the default support investigation:

```bash
npm run demo
```

Or provide a task:

```bash
npm run demo -- "Find order A1001 and explain its current status"
```

A typical trace contains SDK initialization, tool calls, tool results, and assistant text:

```text
[sdk] available tools: Read, Glob, Grep
[tool] Read {"file_path":".../cases/case-001.md"}
[tool result] id=... error=false
[tool] Grep {"pattern":"A1002","path":"..."}
...
[assistant]
The customer qualifies for a full refund...
[sdk] done success=true
```

The exact tools, order, and wording can vary. The SDK decides how to investigate within the configured constraints.

## Read-only configuration

The core options are defined in `src/agent.ts`:

```ts
{
  tools: ["Read", "Glob", "Grep"],
  allowedTools: ["Read", "Glob", "Grep"],
  permissionMode: "dontAsk",
  settingSources: [],
  cwd: workspace
}
```

Each field has a separate role:

| Option | Purpose |
|---|---|
| `tools` | Restricts the tools visible to Claude |
| `allowedTools` | Auto-approves the three selected tools |
| `permissionMode: "dontAsk"` | Denies any unapproved request instead of prompting |
| `settingSources: []` | Prevents user or project Claude settings from adding behavior |
| `cwd` | Makes the sample workspace the task's working directory |
| `maxTurns: 8` | Leaves room for evidence gathering and synthesis while stopping an investigation that does not converge |

This is an application-level capability restriction, not an operating-system sandbox. Production agents handling untrusted input should also use process or container isolation.

## Lab01 compared with Lab03

| Concern | Lab01 | Lab03 |
|---|---|---|
| Entry point | Messages API client | Agent SDK `query()` |
| Tools | Application-defined | SDK built-ins |
| Tool handlers | Written by the application | Supplied by the SDK |
| Agent loop | Manual `for` loop | Managed by the SDK |
| Tool results | Application sends them | SDK sends them |
| Permission policy | Application validation | SDK options and permission system |

The SDK reduces orchestration code, but the application must still choose tools, permissions, workspace boundaries, instructions, and stopping limits.

## Verify offline

```bash
npm test
npm run typecheck
```

The tests make no model calls. They verify the read-only configuration and conversion of SDK stream messages into readable events.

## Experiments

1. Ask for a nonexistent order and observe how the agent reports missing evidence.
2. Remove `Grep` from both tool lists and observe how the investigation changes.
3. Change `maxTurns` to `1` and observe the SDK's maximum-turn result. Broad searches or repeated guesses can exhaust the turn budget before the agent synthesizes an answer.
4. Add another case and policy file, then ask the agent to discover them without naming their paths.
5. Add `Write` only to `tools`, but not `allowedTools`; with `dontAsk`, the write is visible but denied. Do not enable it permanently in this read-only lab.

## Source map

- `src/index.ts`: starts `query()` and consumes the SDK message stream
- `src/agent.ts`: read-only options and human-readable event extraction
- `workspace/`: files inspected by the agent

## References

- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- [Agent SDK quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart)
- [Configure permissions](https://code.claude.com/docs/en/agent-sdk/permissions)
- [TypeScript SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript)

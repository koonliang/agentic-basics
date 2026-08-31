# Lab04: Hooks, Permissions, and Human Approval

Lab03 restricted an agent to read-only tools. Lab04 adds the `Write` tool so the agent can save a customer reply, but it does not grant unrestricted write access.

Every write passes through two independent controls:

1. A `PreToolUse` hook checks the destination path.
2. The `canUseTool` callback asks a human to approve the write.

A `PostToolUse` hook records successful tool calls in a small JSONL audit trail.

## Learning objectives

By the end of this lab, you will be able to explain:

- How hooks differ from tools
- Why hooks run before normal permission evaluation
- How a `PreToolUse` hook blocks unsafe input before execution
- How `canUseTool` pauses an agent for human approval
- How `PostToolUse` records completed actions
- Why multiple controls provide defense in depth

## Control flow

```text
Claude requests Write
         |
         v
PreToolUse path guard
    |             |
 invalid         valid
    |             |
   deny           v
             canUseTool prompt
                |       |
                n       y
                |       |
               deny   execute Write
                         |
                         v
                  PostToolUse audit
```

Read-only tools (`Read`, `Glob`, and `Grep`) are auto-approved. They still pass through the post-tool audit after successful execution.

## Safety policy

The agent can see these tools:

```ts
tools: ["Read", "Glob", "Grep", "Write"]
```

Only the read-only tools are pre-approved:

```ts
allowedTools: ["Read", "Glob", "Grep"]
permissionMode: "default"
```

The write guard permits a request only when:

- The resolved path is inside `workspace/drafts/`
- The destination is a Markdown file ending in `.md`

A valid path is not automatically approved. Returning `{}` from the hook lets normal permission evaluation continue to `canUseTool`. Invalid paths return `permissionDecision: "deny"` and never reach the human prompt.

## Setup

Requirements: Node.js 22 or later and an Anthropic-compatible API key.

```bash
cd Lab04
npm ci
cp .env.example .env
```

Edit `.env`:

```dotenv
ANTHROPIC_API_KEY=your-key
ANTHROPIC_BASE_URL=https://api.anthropic.com
CLAUDE_MODEL=claude-haiku-4-5
```

The built-in filesystem tools execute locally. A custom gateway only needs to support standard Anthropic Messages API client-tool calls; this lab does not use Anthropic server-side web search.

## Run the approval demo

```bash
npm run demo
```

The agent reads the case, order, and refund policy, then requests a write similar to:

```text
[tool] Write {"file_path":".../workspace/drafts/reply-case-001.md",...}
Allow Write to .../workspace/drafts/reply-case-001.md? (y/N):
```

Enter `y` to allow the write. Any other response denies it.

### Approve the write

After entering `y`, inspect the draft:

```bash
sed -n '1,160p' workspace/drafts/reply-case-001.md
```

The agent writes a draft only; it does not send a customer message.

### Deny the write

Run the demo again and enter `n`. The callback returns:

```ts
{ behavior: "deny", message: "The user declined to save the draft." }
```

Claude receives the denial and can explain that the reply was not saved. The existing draft, if any, remains unchanged because the new Write call did not execute.

### Observe the path guard

The unit tests exercise traversal and wrong-extension attempts directly:

```bash
npm test
```

Requests such as `drafts/../../orders.md` and `drafts/reply.txt` are denied by the hook before `canUseTool` can ask for approval.

## Audit trail

The demo creates `.runtime/audit.jsonl`. Each line is one JSON event:

```bash
sed -n '1,160p' .runtime/audit.jsonl
```

The audit includes:

- Write-guard path decisions
- Human approval or denial
- Successful tool completion

It records metadata such as tool name, tool-use ID, path, and decision. It deliberately does not record tool output or draft contents.

Example:

```json
{"timestamp":"...","event":"write_guard","tool":"Write","toolUseId":"...","path":".../drafts/reply-case-001.md","decision":"path_allowed"}
{"timestamp":"...","event":"human_approval","tool":"Write","toolUseId":"...","path":".../drafts/reply-case-001.md","decision":"approved"}
{"timestamp":"...","event":"tool_completed","tool":"Write","toolUseId":"...","path":".../drafts/reply-case-001.md","decision":"success"}
```

The audit writer is application code invoked by hooks. It is not a tool available to Claude.

## Hooks compared with permissions

| Mechanism | Responsibility in this lab |
|---|---|
| `tools` | Limits Claude to four named capabilities |
| `allowedTools` | Auto-approves safe read operations |
| `PreToolUse` | Enforces the non-negotiable path policy |
| `canUseTool` | Captures the human's decision for a valid write |
| `PostToolUse` | Records successful execution |

The path restriction belongs in `PreToolUse`, not only in the approval UI. Hooks run for every matching call and a denial takes priority over later permission decisions.

## Verify offline

```bash
npm test
npm run typecheck
```

The tests make no model calls. They cover configuration, safe paths, traversal, file extensions, approval, denial, unexpected tools, and audit metadata.

## Source map

- `src/hooks.ts`: pre-write guard and post-tool audit hook
- `src/approval.ts`: terminal prompt and permission result
- `src/audit.ts`: minimal JSONL writer
- `src/agent.ts`: Agent SDK configuration and stream events
- `src/index.ts`: assembles the controls and calls `query()`

## References

- [Agent SDK hooks](https://code.claude.com/docs/en/agent-sdk/hooks)
- [Handle approvals and user input](https://code.claude.com/docs/en/agent-sdk/user-input)
- [Configure permissions](https://code.claude.com/docs/en/agent-sdk/permissions)

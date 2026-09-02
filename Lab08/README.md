# Lab08 — Evaluate tool choices with Message Batches

Lab08 turns tool use into a small, repeatable evaluation. It submits labeled support prompts through the Anthropic Message Batches API, retrieves results that may arrive out of order, joins them by `custom_id`, and scores Claude's first-turn tool selection and arguments.

The batch asks Claude to choose tools but does not execute them. This isolates the decision being evaluated from tool handlers and later agent turns.

## Learning objectives

By the end of this lab, you will be able to:

- create multiple Messages API requests as one asynchronous batch;
- use unique `custom_id` values to join unordered results to test cases;
- distinguish batch processing success from evaluation success;
- score tool names separately from tool arguments;
- handle errored, canceled, expired, and missing results; and
- explain why one evaluation run is evidence, not a guarantee of future behavior.

## Evaluation flow

```text
data/evaluation-cases.json
          |
          | build labeled requests
          v
Anthropic Message Batch
          |
          | asynchronous, unordered JSONL results
          v
join results by custom_id
          |
          v
score expected tool + expected input
```

## What is measured

Each case declares:

```json
{
  "custom_id": "known_order",
  "prompt": "What is the current status of order A1001?",
  "expected_tool": "get_order_status",
  "expected_input": { "order_id": "A1001" }
}
```

For a tool-using case to pass, Claude must produce exactly one `tool_use` block with the expected name and exact JSON input. A case with `expected_tool: null` passes only when Claude produces no tool call.

The five included cases test:

- a count-only question;
- a known order ID;
- discovering IDs before retrieving every order;
- an unknown but syntactically valid order ID; and
- a request that needs no order tool.

These are first-turn evaluations. For example, the all-orders case expects `list_order_ids`; the batch does not execute that tool or evaluate the later `get_order_status` calls.

## Setup

Requirements: Node.js 22 or later, npm 10 or later, and an Anthropic API key with Message Batches access.

From the repository root:

```bash
cp .env.example .env
cd Lab08
npm ci
```

Lab08 uses the shared `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, and `CLAUDE_MODEL` values.

Your custom gateway must implement the Anthropic-compatible `/v1/messages/batches` create, retrieve, and results endpoints. A gateway that supports ordinary Messages requests may still lack Message Batches. If so, use the direct Anthropic API base URL for this lab.

## 1. Submit a batch

```bash
npm run submit
```

The command prints a batch ID:

```text
[batch] id=msgbatch_... status=in_progress
[counts] {"processing":5,"succeeded":0,"errored":0,"canceled":0,"expired":0}

Next: npm run status -- msgbatch_...
```

Save the ID. Creating the batch begins processing immediately and consumes API credits.

## 2. Check status

```bash
npm run status -- msgbatch_...
```

The status is `in_progress`, `canceling`, or `ended`. Results are ready only after the status becomes `ended`. Batch processing is asynchronous and can take substantially longer than an ordinary Messages request, so this lab deliberately does not poll in a blocking loop.

## 3. Score results

```bash
npm run score -- msgbatch_...
```

The report separates selection from argument correctness:

```text
┌─────────┬───────────────────┬──────┬────────────────────┬────────────────────┬───────────┬───────────┬───────────────────────────────┐
│ (index) │ case              │ pass │ expected           │ actual             │ selection │ arguments │ reason                        │
├─────────┼───────────────────┼──────┼────────────────────┼────────────────────┼───────────┼───────────┼───────────────────────────────┤
│ 0       │ known_order       │ true │ get_order_status   │ get_order_status   │ true      │ true      │ Tool and arguments matched.   │
└─────────┴───────────────────┴──────┴────────────────────┴────────────────────┴───────────┴───────────┴───────────────────────────────┘
[score] 5/5 passed (100.0%)
```

Evaluation failures do not make the command exit with an error; they are the result being measured. API failures, invalid commands, missing IDs, and attempts to score an unfinished batch do produce an error exit.

## Why `custom_id` matters

Batch results are not guaranteed to use request order. Array position therefore cannot identify a case. The scorer builds a map keyed by `custom_id` and evaluates each original case against its matching result. A missing result is a failed case rather than being silently ignored.

## Batch success versus evaluation success

These answer different questions:

| Signal | Meaning |
| --- | --- |
| Batch result `succeeded` | Anthropic processed that Messages request |
| Selection correct | Claude chose the expected tool and no extra tool |
| Arguments correct | The selected tool input exactly matched the label |
| Case passed | Selection and arguments both passed |

An API request can succeed while the evaluation fails. Conversely, an errored, canceled, expired, or missing request cannot pass the evaluation.

## Verify offline

```bash
npm test
npm run typecheck
```

The tests make no network or model calls. They verify case loading, request construction, out-of-order result matching, no-tool cases, wrong tools, wrong arguments, and unsuccessful batch entries.

## Interpreting results

Model behavior is probabilistic. A five-case batch is useful for learning the mechanics but too small for a production quality claim. A larger evaluation should include paraphrases, edge cases, repeated trials, versioned datasets, model identifiers, and an explicit release threshold.

Changing a tool description can improve one case while harming another. Treat the dataset as a regression suite: change one variable, submit another batch, and compare case-level results.

## Source map

- `data/evaluation-cases.json`: prompts and expected tool behavior
- `src/evaluation.ts`: tool definitions, batch request construction, and scoring
- `src/batch-client.ts`: Anthropic Message Batches adapter
- `src/index.ts`: submit, status, and score CLI workflow
- `test/evaluation.test.ts`: offline scoring tests

## References

- [Batch processing guide](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
- [Create a Message Batch](https://platform.claude.com/docs/en/api/messages/batches/create)
- [Retrieve Message Batch results](https://platform.claude.com/docs/en/api/messages/batches/results)
- [Claude tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works)

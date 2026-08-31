import { extname, isAbsolute, relative, resolve } from "node:path";

import type {
  HookCallback,
  PostToolUseHookInput,
  PreToolUseHookInput,
} from "@anthropic-ai/claude-agent-sdk";

import type { AuditWriter } from "./audit.js";

export function createWriteGuard(draftsDirectory: string, audit: AuditWriter): HookCallback {
  const allowedDirectory = resolve(draftsDirectory);

  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};

    const preInput = input as PreToolUseHookInput;
    const filePath = getFilePath(preInput.tool_input);
    const targetPath = filePath ? resolve(preInput.cwd, filePath) : "";
    const pathFromDrafts = targetPath ? relative(allowedDirectory, targetPath) : "";
    const allowed =
      pathFromDrafts !== "" &&
      !pathFromDrafts.startsWith("..") &&
      !isAbsolute(pathFromDrafts) &&
      extname(targetPath).toLowerCase() === ".md";

    await audit({
      event: "write_guard",
      tool: preInput.tool_name,
      toolUseId: preInput.tool_use_id,
      ...(targetPath ? { path: targetPath } : {}),
      decision: allowed ? "path_allowed" : "path_denied",
    });

    if (allowed) return {};

    return {
      systemMessage: "The write guard blocked a path outside workspace/drafts or a non-Markdown file.",
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Drafts may only be written as Markdown files inside workspace/drafts.",
      },
    };
  };
}

export function createPostToolAudit(audit: AuditWriter): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== "PostToolUse") return {};

    const postInput = input as PostToolUseHookInput;
    const filePath = getFilePath(postInput.tool_input);
    await audit({
      event: "tool_completed",
      tool: postInput.tool_name,
      toolUseId: postInput.tool_use_id,
      ...(filePath ? { path: resolve(postInput.cwd, filePath) } : {}),
      decision: "success",
    });
    return {};
  };
}

function getFilePath(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const filePath = (input as Record<string, unknown>).file_path;
  return typeof filePath === "string" ? filePath : undefined;
}

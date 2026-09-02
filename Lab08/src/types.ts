export interface EvaluationCase {
  customId: string;
  prompt: string;
  expectedTool: string | null;
  expectedInput: Record<string, unknown> | null;
}

export interface ToolCall {
  name: string;
  input: unknown;
}

export interface BatchResult {
  customId: string;
  result: unknown;
}

export interface CaseScore {
  customId: string;
  passed: boolean;
  expectedTool: string | null;
  actualTools: string[];
  selectionCorrect: boolean;
  argumentsCorrect: boolean | null;
  reason: string;
}

export interface EvaluationReport {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  cases: CaseScore[];
}

import assert from "node:assert/strict";
import test from "node:test";

import { parseDemoArguments, parseQuestion } from "../src/arguments.js";
import { formatDate, parseDate } from "../src/dates.js";

test("parses policy filters and plain comparison questions", () => {
  assert.deepEqual(parseDemoArguments([
    "--region", "singapore", "--status", "CURRENT", "--as-of", "2026-09-14", "What", "applies?",
  ]), {
    question: "What applies?",
    criteria: { region: "Singapore", status: "current", effectiveOnOrBefore: 20260914 },
  });
  assert.equal(parseQuestion(["What", "fee?"]), "What fee?");
  assert.throws(() => parseQuestion([]), /Pass a question/);
});

test("validates dates and policy-only statuses", () => {
  assert.equal(parseDate("2024-02-29"), 20240229);
  assert.equal(formatDate(20260914), "2026-09-14");
  assert.throws(() => parseDate("2026-02-29"), /valid date/);
  assert.throws(() => parseDemoArguments([
    "--region", "Global", "--status", "fixture", "--as-of", "2026-09-14", "Question",
  ]), /--status must be one of/);
});

test("rejects missing, duplicate, and unknown demo options", () => {
  assert.throws(() => parseDemoArguments(["question"]), /--region is required/);
  assert.throws(() => parseDemoArguments([
    "--region", "Singapore", "--region", "Global", "--status", "current", "--as-of", "2026-09-14", "question",
  ]), /more than once/);
  assert.throws(() => parseDemoArguments(["--country", "SG", "question"]), /Unknown option/);
});

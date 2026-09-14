import assert from "node:assert/strict";
import test from "node:test";

import { parseDemoArguments } from "../src/arguments.js";
import { formatDate, parseDate } from "../src/dates.js";

test("parses and normalizes required filter options", () => {
  assert.deepEqual(parseDemoArguments([
    "--region", "singapore",
    "--status", "CURRENT",
    "--as-of", "2026-09-14",
    "What", "policy", "applies?",
  ]), {
    question: "What policy applies?",
    criteria: {
      region: "Singapore",
      status: "current",
      effectiveOnOrBefore: 20260914,
    },
  });
});

test("validates dates in both representations", () => {
  assert.equal(parseDate("2024-02-29"), 20240229);
  assert.equal(formatDate(20260914), "2026-09-14");
  assert.throws(() => parseDate("2026-02-29"), /valid date/);
  assert.throws(() => formatDate(20260229), /valid YYYYMMDD/);
});

test("rejects missing, duplicate, and unknown options", () => {
  assert.throws(() => parseDemoArguments(["question"]), /--region is required/);
  assert.throws(() => parseDemoArguments([
    "--region", "Singapore", "--region", "Global",
    "--status", "current", "--as-of", "2026-09-14", "question",
  ]), /more than once/);
  assert.throws(() => parseDemoArguments(["--country", "SG", "question"]), /Unknown option/);
  assert.throws(() => parseDemoArguments([
    "--region", "Singapore", "--status", "current", "--as-of", "2026-09-14",
  ]), /Pass a question/);
});

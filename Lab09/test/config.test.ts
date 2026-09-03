import assert from "node:assert/strict";
import test from "node:test";

import { parsePort } from "../src/config.js";

test("uses AgentCore port 8080 by default", () => {
  assert.equal(parsePort(undefined), 8080);
  assert.equal(parsePort(""), 8080);
});

test("accepts a valid local port", () => {
  assert.equal(parsePort("18080"), 18080);
});

test("rejects invalid local ports", () => {
  for (const value of ["0", "65536", "1.5", "not-a-port"]) {
    assert.throws(() => parsePort(value), /LAB09_PORT/);
  }
});

import { parseDate } from "./dates.js";
import {
  policyStatuses,
  regions,
  type FilterCriteria,
  type PolicyStatus,
  type Region,
} from "./types.js";

export interface DemoArguments {
  criteria: FilterCriteria;
  question: string;
}

export function parseDemoArguments(args: string[]): DemoArguments {
  const values = new Map<string, string>();
  const questionParts: string[] = [];
  const knownFlags = new Set(["--region", "--status", "--as-of"]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument) continue;
    if (!argument.startsWith("--")) {
      questionParts.push(argument);
      continue;
    }
    if (!knownFlags.has(argument)) throw new Error(`Unknown option: ${argument}.`);
    if (values.has(argument)) throw new Error(`Option ${argument} was provided more than once.`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Option ${argument} requires a value.`);
    values.set(argument, value);
    index += 1;
  }

  const question = questionParts.join(" ").trim();
  if (!question) throw new Error("Pass a question after the filter options.");

  return {
    question,
    criteria: {
      region: parseRegion(required(values, "--region")),
      status: parseStatus(required(values, "--status")),
      effectiveOnOrBefore: parseDate(required(values, "--as-of")),
    },
  };
}

function required(values: Map<string, string>, name: string): string {
  const value = values.get(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parseRegion(value: string): Region {
  const region = regions.find((item) => item.toLowerCase() === value.toLowerCase());
  if (!region) throw new Error(`--region must be one of: ${regions.join(", ")}.`);
  return region;
}

function parseStatus(value: string): PolicyStatus {
  const status = policyStatuses.find((item) => item.toLowerCase() === value.toLowerCase());
  if (!status) throw new Error(`--status must be one of: ${policyStatuses.join(", ")}.`);
  return status;
}

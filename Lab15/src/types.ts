export const regions = ["Singapore", "Australia", "Global"] as const;
export const policyStatuses = ["current", "superseded"] as const;

export type Region = typeof regions[number];
export type PolicyStatus = typeof policyStatuses[number];

export interface PolicyMetadata {
  documentId: string;
  title: string;
  region: Region;
  version: string;
  status: PolicyStatus;
  effectiveDate: number;
}

export interface FilterCriteria {
  region: Region;
  status: PolicyStatus;
  effectiveOnOrBefore: number;
}

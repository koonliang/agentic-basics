export const regions = ["Singapore", "Australia", "Global"] as const;
export const policyStatuses = ["current", "superseded"] as const;
export const documentStatuses = [...policyStatuses, "fixture"] as const;
export const representations = ["mixed", "native", "image"] as const;

export type Region = typeof regions[number];
export type PolicyStatus = typeof policyStatuses[number];
export type DocumentStatus = typeof documentStatuses[number];
export type Representation = typeof representations[number];

export interface DocumentMetadata {
  documentId: string;
  filename: string;
  title: string;
  region: Region;
  version: string;
  status: DocumentStatus;
  effectiveDate: number;
  representation: Representation;
}

export interface FilterCriteria {
  region: Region;
  status: PolicyStatus;
  effectiveOnOrBefore: number;
}

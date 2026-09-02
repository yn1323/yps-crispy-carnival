import { v } from "convex/values";
import { z } from "zod";

const requestIdSchema = z.string().max(64).uuid();
const previewFingerprintSchema = z
  .string()
  .length(64)
  .regex(/^[a-f0-9]+$/);

export const accountDeletionRequestSchema = z.union([
  z.object({ requestId: requestIdSchema }).strict(),
  z
    .object({
      requestId: requestIdSchema,
      scope: z.literal("accountAndAssociations"),
      previewFingerprint: previewFingerprintSchema,
    })
    .strict(),
]);

export const accountDeletionJobStatusValidator = v.union(
  v.literal("queued"),
  v.literal("processing"),
  v.literal("retrying"),
  v.literal("actionRequired"),
  v.literal("completed"),
);

export const accountDeletionJobPhaseValidator = v.union(
  v.literal("waitForOrganizationCleanup"),
  v.literal("waitForSharedCleanup"),
  v.literal("verifyProviderUser"),
  v.literal("deleteProviderUser"),
  v.literal("complete"),
);

export const accountDeletionErrorCodeValidator = v.union(
  v.literal("organization_cleanup_action_required"),
  v.literal("organization_cleanup_invalid"),
  v.literal("shared_cleanup_invalid"),
  v.literal("association_found_before_provider_delete"),
  v.literal("association_scan_unknown_before_provider_delete"),
  v.literal("provider_configuration_missing"),
  v.literal("provider_configuration_mismatch"),
  v.literal("provider_instance_mismatch"),
  v.literal("provider_user_not_found_before_verification"),
  v.literal("provider_unauthorized"),
  v.literal("provider_forbidden"),
  v.literal("provider_bad_request"),
  v.literal("provider_rate_limited"),
  v.literal("provider_unavailable"),
  v.literal("provider_timeout"),
  v.literal("provider_network"),
  v.literal("lease_expired"),
  v.literal("retry_exhausted"),
  v.literal("invalid_provider_evidence"),
);

export type AccountDeletionErrorCode =
  | "organization_cleanup_action_required"
  | "organization_cleanup_invalid"
  | "shared_cleanup_invalid"
  | "association_found_before_provider_delete"
  | "association_scan_unknown_before_provider_delete"
  | "provider_configuration_missing"
  | "provider_configuration_mismatch"
  | "provider_instance_mismatch"
  | "provider_user_not_found_before_verification"
  | "provider_unauthorized"
  | "provider_forbidden"
  | "provider_bad_request"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "provider_timeout"
  | "provider_network"
  | "lease_expired"
  | "retry_exhausted"
  | "invalid_provider_evidence";

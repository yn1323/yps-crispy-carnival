import type { LoginMethodMigrationFlow } from "@/src/components/features/LoginMethods";

export type AccountSecuritySearch = {
  org?: string;
  flow?: LoginMethodMigrationFlow;
  oauth?: "google";
};

export function validateAccountSecuritySearch(search: Record<string, unknown>): AccountSecuritySearch {
  const org = typeof search.org === "string" && search.org.trim() !== "" ? search.org.trim() : undefined;
  const flow = isAccountSecurityFlow(search.flow) ? search.flow : undefined;
  const oauth = search.oauth === "google" && flow === "connect-google" ? "google" : undefined;

  return {
    ...(org ? { org } : {}),
    ...(flow ? { flow } : {}),
    ...(oauth ? { oauth } : {}),
  };
}

export function clearAccountSecurityOAuthSearch(search: Record<string, unknown>) {
  const { org, flow } = validateAccountSecuritySearch(search);
  return { ...(org ? { org } : {}), ...(flow ? { flow } : {}), oauth: undefined, shop: undefined };
}

export function clearAccountSecurityFlowSearch(search: Record<string, unknown> = {}) {
  const { org } = validateAccountSecuritySearch(search);
  return { ...(org ? { org } : {}), flow: undefined, oauth: undefined, shop: undefined };
}

export function buildCanonicalAccountSecuritySearch(search: Record<string, unknown>): AccountSecuritySearch {
  return validateAccountSecuritySearch(search);
}

export function buildCanonicalAccountSecuritySearchString(search: Record<string, unknown>): string {
  const canonical = buildCanonicalAccountSecuritySearch(search);
  const params = new URLSearchParams();
  if (canonical.org) params.set("org", canonical.org);
  if (canonical.flow) params.set("flow", canonical.flow);
  if (canonical.oauth) params.set("oauth", canonical.oauth);
  const value = params.toString();
  return value ? `?${value}` : "";
}

export function needsAccountSecuritySearchCanonicalization(
  rawSearch: string,
  validatedSearch: AccountSecuritySearch,
): boolean {
  return rawSearch !== buildCanonicalAccountSecuritySearchString(validatedSearch);
}

function isAccountSecurityFlow(value: unknown): value is LoginMethodMigrationFlow {
  return value === "add-email-password" || value === "connect-google";
}

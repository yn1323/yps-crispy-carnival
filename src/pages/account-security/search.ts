import type { LoginMethodMigrationFlow } from "@/src/components/features/LoginMethods";

export type AccountSecuritySearch = {
  flow?: LoginMethodMigrationFlow;
  oauth?: "google";
};

export function validateAccountSecuritySearch(search: Record<string, unknown>): AccountSecuritySearch {
  const flow = isAccountSecurityFlow(search.flow) ? search.flow : undefined;
  const oauth = search.oauth === "google" && flow === "connect-google" ? "google" : undefined;

  return {
    ...(flow ? { flow } : {}),
    ...(oauth ? { oauth } : {}),
  };
}

export function clearAccountSecurityOAuthSearch(search: Record<string, unknown>) {
  const { flow } = validateAccountSecuritySearch(search);
  return { ...(flow ? { flow } : {}), oauth: undefined, shop: undefined };
}

export function clearAccountSecurityFlowSearch() {
  return { flow: undefined, oauth: undefined, shop: undefined };
}

export function buildCanonicalAccountSecuritySearch(search: Record<string, unknown>): AccountSecuritySearch {
  return validateAccountSecuritySearch(search);
}

export function buildCanonicalAccountSecuritySearchString(search: Record<string, unknown>): string {
  const canonical = buildCanonicalAccountSecuritySearch(search);
  const params = new URLSearchParams();
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

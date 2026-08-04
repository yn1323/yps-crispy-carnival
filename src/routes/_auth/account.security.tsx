import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { AccountSecurityPage, type AccountSecurityPageFlow } from "@/src/pages/account-security";
import { buildAccountSecurityPageHead } from "@/src/pages/account-security/meta";

export type AccountSecuritySearch = {
  flow?: AccountSecurityPageFlow;
  oauth?: "google";
};

export const Route = createFileRoute("/_auth/account/security")({
  validateSearch: validateAccountSecuritySearch,
  head: buildAccountSecurityPageHead,
  component: AccountSecurityRoute,
});

export function validateAccountSecuritySearch(search: Record<string, unknown>): AccountSecuritySearch {
  const flow = isAccountSecurityFlow(search.flow) ? search.flow : undefined;
  const oauth = search.oauth === "google" && isGoogleOAuthFlow(flow) ? "google" : undefined;
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

function AccountSecurityRoute() {
  const navigate = Route.useNavigate();
  const { flow, oauth } = Route.useSearch();

  useEffect(() => {
    const validatedSearch = { ...(flow ? { flow } : {}), ...(oauth ? { oauth } : {}) };
    if (!needsAccountSecuritySearchCanonicalization(window.location.search, validatedSearch)) return;
    void navigate({
      replace: true,
      search: () => buildCanonicalAccountSecuritySearch(validatedSearch),
    });
  }, [flow, navigate, oauth]);

  const handleStartFlow = useCallback(
    (nextFlow: AccountSecurityPageFlow) => {
      void navigate({ search: () => ({ flow: nextFlow, oauth: undefined, shop: undefined }) });
    },
    [navigate],
  );
  const handleBackToOverview = useCallback(() => {
    void navigate({ replace: true, search: clearAccountSecurityFlowSearch });
  }, [navigate]);
  const handleGoogleOAuthReturn = useCallback(() => {
    void navigate({
      replace: true,
      search: clearAccountSecurityOAuthSearch,
    });
  }, [navigate]);

  return (
    <AccountSecurityPage
      flow={flow}
      oauth={oauth}
      onStartFlow={handleStartFlow}
      onBackToOverview={handleBackToOverview}
      onGoogleOAuthReturnHandled={handleGoogleOAuthReturn}
    />
  );
}

function isAccountSecurityFlow(value: unknown): value is AccountSecurityPageFlow {
  return value === "add-email-password" || value === "connect-google" || value === "replace-google";
}

function isGoogleOAuthFlow(flow: AccountSecurityPageFlow | undefined) {
  return flow === "connect-google" || flow === "replace-google";
}

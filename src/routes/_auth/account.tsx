import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { AccountSecurityPage, type AccountSecurityPageFlow } from "@/src/pages/account-security";
import { buildAccountSecurityPageHead } from "@/src/pages/account-security/meta";
import {
  buildCanonicalAccountSecuritySearch,
  clearAccountSecurityFlowSearch,
  clearAccountSecurityOAuthSearch,
  needsAccountSecuritySearchCanonicalization,
  validateAccountSecuritySearch,
} from "@/src/pages/account-security/search";

export type { AccountSecuritySearch } from "@/src/pages/account-security/search";
export {
  buildCanonicalAccountSecuritySearch,
  buildCanonicalAccountSecuritySearchString,
  clearAccountSecurityFlowSearch,
  clearAccountSecurityOAuthSearch,
  needsAccountSecuritySearchCanonicalization,
  validateAccountSecuritySearch,
} from "@/src/pages/account-security/search";

export const Route = createFileRoute("/_auth/account")({
  validateSearch: validateAccountSecuritySearch,
  head: buildAccountSecurityPageHead,
  component: AccountSecurityRoute,
});

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

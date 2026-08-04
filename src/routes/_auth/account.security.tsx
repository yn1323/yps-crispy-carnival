import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { AccountSecurityPage } from "@/src/pages/account-security";
import { buildAccountSecurityPageHead } from "@/src/pages/account-security/meta";

export const Route = createFileRoute("/_auth/account/security")({
  validateSearch: validateAccountSecuritySearch,
  head: buildAccountSecurityPageHead,
  component: AccountSecurityRoute,
});

export function validateAccountSecuritySearch(search: Record<string, unknown>): { oauth?: "google" } {
  return search.oauth === "google" ? { oauth: "google" } : {};
}

export function clearAccountSecurityOAuthSearch(search: Record<string, unknown>) {
  return { ...search, oauth: undefined, shop: undefined };
}

function AccountSecurityRoute() {
  const navigate = Route.useNavigate();
  const { oauth } = Route.useSearch();
  const handleGoogleOAuthReturn = useCallback(() => {
    void navigate({
      replace: true,
      search: clearAccountSecurityOAuthSearch,
    });
  }, [navigate]);

  return (
    <AccountSecurityPage googleOAuthReturn={oauth === "google"} onGoogleOAuthReturnHandled={handleGoogleOAuthReturn} />
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { ManagerInviteStaffPage } from "@/src/pages/manager-settings/invite-staff";
import { buildManagerSettingsPageHead } from "@/src/pages/manager-settings/meta";

type ManagerSettingsSearch = { shop?: string };

export const Route = createFileRoute("/_auth/settings_/managers_/invite-staff")({
  head: buildManagerSettingsPageHead,
  validateSearch: validateManagerSettingsSearch,
  component: ManagerInviteStaffRoute,
});

function ManagerInviteStaffRoute() {
  const { shop } = Route.useSearch();
  return <ManagerInviteStaffPage shopId={shop} />;
}

function validateManagerSettingsSearch(search: Record<string, unknown>): ManagerSettingsSearch {
  const shop = typeof search.shop === "string" && search.shop.trim() !== "" ? search.shop : undefined;
  return shop ? { shop } : {};
}

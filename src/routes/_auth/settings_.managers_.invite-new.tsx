import { createFileRoute } from "@tanstack/react-router";
import { ManagerInviteNewPage } from "@/src/pages/manager-settings/invite-new";
import { buildManagerSettingsPageHead } from "@/src/pages/manager-settings/meta";

type ManagerSettingsSearch = { shop?: string };

export const Route = createFileRoute("/_auth/settings_/managers_/invite-new")({
  head: buildManagerSettingsPageHead,
  validateSearch: validateManagerSettingsSearch,
  component: ManagerInviteNewRoute,
});

function ManagerInviteNewRoute() {
  const { shop } = Route.useSearch();
  return <ManagerInviteNewPage shopId={shop} />;
}

function validateManagerSettingsSearch(search: Record<string, unknown>): ManagerSettingsSearch {
  const shop = typeof search.shop === "string" && search.shop.trim() !== "" ? search.shop : undefined;
  return shop ? { shop } : {};
}

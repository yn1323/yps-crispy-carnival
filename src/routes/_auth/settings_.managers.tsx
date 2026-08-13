import { createFileRoute } from "@tanstack/react-router";
import { ManagerSettingsPage } from "@/src/pages/manager-settings";
import { buildManagerSettingsPageHead } from "@/src/pages/manager-settings/meta";

type ManagerSettingsSearch = { shop?: string };

export const Route = createFileRoute("/_auth/settings_/managers")({
  head: buildManagerSettingsPageHead,
  validateSearch: validateManagerSettingsSearch,
  component: ManagerSettingsRoute,
});

export function validateManagerSettingsSearch(search: Record<string, unknown>): ManagerSettingsSearch {
  const shop = typeof search.shop === "string" && search.shop.trim() !== "" ? search.shop : undefined;
  return shop ? { shop } : {};
}

function ManagerSettingsRoute() {
  const { shop } = Route.useSearch();
  return <ManagerSettingsPage shopId={shop} />;
}

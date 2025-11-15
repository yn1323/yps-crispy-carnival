import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/src/components/pages/Settings/SettingsPage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/settings/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Animation>
      <SettingsPage />
    </Animation>
  );
}

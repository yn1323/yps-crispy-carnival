import { createFileRoute } from "@tanstack/react-router";
import { ShiftTemplateList } from "@/src/components/pages/Settings/ShiftTemplateList";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/settings/shift-template/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Animation>
      <ShiftTemplateList />
    </Animation>
  );
}

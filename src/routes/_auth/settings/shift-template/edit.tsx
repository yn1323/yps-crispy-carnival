import { createFileRoute } from "@tanstack/react-router";
import { ShiftTemplateForm } from "@/src/components/pages/Settings/ShiftTemplateForm";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/settings/shift-template/edit")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Animation>
      <ShiftTemplateForm mode="edit" />
    </Animation>
  );
}

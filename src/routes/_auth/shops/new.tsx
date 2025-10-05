import { createFileRoute } from "@tanstack/react-router";
import { ShopsNewPage } from "@/src/components/pages/Shops/NewPage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/new")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Animation>
      <ShopsNewPage />
    </Animation>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { ShopsListPage } from "@/src/components/pages/Shops/ListPage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Animation>
      <ShopsListPage />
    </Animation>
  );
}

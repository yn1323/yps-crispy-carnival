import { createFileRoute } from "@tanstack/react-router";
import { ShopsList } from "@/src/components/pages/Shops/List";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Animation>
      <ShopsList />
    </Animation>
  );
}

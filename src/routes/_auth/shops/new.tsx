import { createFileRoute } from "@tanstack/react-router";
import { CreateShop } from "@/src/components/features/Shop/CreateShop";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/new")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Animation>
      <CreateShop />
    </Animation>
  );
}

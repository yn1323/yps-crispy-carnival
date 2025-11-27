import { createFileRoute } from "@tanstack/react-router";
import { TopPage } from "@/src/components/pages/TopPage";
import { Animation } from "@/src/components/templates/Animation";

const App = () => {
  return (
    <Animation>
      <TopPage />
    </Animation>
  );
};

export const Route = createFileRoute("/")({
  component: App,
});

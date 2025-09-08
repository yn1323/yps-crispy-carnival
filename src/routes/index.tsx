import { createFileRoute } from "@tanstack/react-router";
import { Top } from "@/src/components/features/Top";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  return (
    <Animation>
      <Top />
    </Animation>
  );
}

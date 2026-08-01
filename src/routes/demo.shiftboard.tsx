import { createFileRoute } from "@tanstack/react-router";
import { DemoShiftBoardRoutePage } from "@/src/pages/demo-shift-board";
import { buildDemoShiftBoardPageHead } from "@/src/pages/demo-shift-board/meta";

export const Route = createFileRoute("/demo/shiftboard")({
  head: buildDemoShiftBoardPageHead,
  component: DemoShiftBoardRoutePage,
});

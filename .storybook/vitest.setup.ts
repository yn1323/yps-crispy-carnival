import { setProjectAnnotations } from "@storybook/react-vite";
import * as projectAnnotations from "./preview";

// This is an important step to apply the right configuration when testing your stories.
// More info at: https://storybook.js.org/docs/api/portable-stories/portable-stories-vitest#setprojectannotations
setProjectAnnotations([projectAnnotations]);

// Clerkのwarningをオフにする
const warn = console.warn;
console.warn = (...args) => {
  const NODE_ENV = process.env.NODE_ENV;
  const clerkStartMsg = "Clerk: Clerk has been loaded with development keys.";
  if (NODE_ENV === "development" && typeof args[0] === "string" && args[0].startsWith(clerkStartMsg)) {
    return;
  }
  warn.apply(console, args);
};

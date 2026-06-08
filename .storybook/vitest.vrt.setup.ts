import { screenshot } from "@storycap-testrun/browser";
import { afterEach, beforeEach } from "vitest";
import { page } from "vitest/browser";

const VRT_VIEWPORT = {
  width: 1920,
  height: 1080,
} as const;

beforeEach(async () => {
  await page.viewport(VRT_VIEWPORT.width, VRT_VIEWPORT.height);
});

afterEach(async (context) => {
  applyLegacySnapshotSkip(context);
  await screenshot(page, context, {
    fullPage: true,
    scale: "css",
    flakiness: {
      retake: {
        enabled: true,
        retries: 3,
      },
    },
  });
});

function applyLegacySnapshotSkip(context: unknown) {
  const story = getMutableStoryContext(context);
  if (!story) return;

  const parameters = story.parameters;
  const shouldSkip =
    parameters.chromatic?.disableSnapshot === true ||
    parameters.pxdiff?.disable === true ||
    parameters.screenshot?.skip === true;

  if (!shouldSkip) return;

  parameters.screenshot = {
    ...parameters.screenshot,
    skip: true,
  };
}

type MutableStoryContext = {
  parameters: {
    chromatic?: {
      disableSnapshot?: boolean;
    };
    pxdiff?: {
      disable?: boolean;
    };
    screenshot?: {
      skip?: boolean;
    };
  };
};

function getMutableStoryContext(context: unknown): MutableStoryContext | null {
  if (typeof context !== "function" || !("story" in context)) return null;
  const story = context.story;
  if (!story || typeof story !== "object" || !("parameters" in story)) return null;
  const parameters = story.parameters;
  if (!parameters || typeof parameters !== "object") return null;
  return { parameters };
}

import { type BrowserScreenshotHook, screenshot } from "@storycap-testrun/browser";
import { afterEach, beforeEach } from "vitest";
import { page } from "vitest/browser";

type ViewportSize = {
  width: number;
  height: number;
};

declare const __VRT_VIEWPORT__: ViewportSize;

const FREEZE_STYLE_ID = "vrt-freeze-animations";
const RELEASE_FIXED_HEADER_STYLE_ID = "vrt-release-fixed-header";

// play実行中〜安定性チェック中も画面を静止させる
// （animation: none だとfade-in系が初期状態のまま固まるため、duration≒0 + 1回再生にする）
function freezeAnimations() {
  if (document.getElementById(FREEZE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = FREEZE_STYLE_ID;
  style.textContent = `
    *, *::before, *::after {
      animation-duration: 0.001s !important;
      animation-delay: 0s !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
      scroll-behavior: auto !important;
      caret-color: transparent !important;
    }
  `;
  document.head.appendChild(style);
}

function releaseFixedHeaderForFullPage(): BrowserScreenshotHook {
  return {
    async setup() {
      applyReleaseFixedHeaderStyle();
    },
    async preCapture() {
      applyReleaseFixedHeaderStyle();
    },
    async postCapture() {
      document.getElementById(RELEASE_FIXED_HEADER_STYLE_ID)?.remove();
    },
  };
}

function applyReleaseFixedHeaderStyle() {
  if (document.getElementById(RELEASE_FIXED_HEADER_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = RELEASE_FIXED_HEADER_STYLE_ID;
  style.textContent = `
    header {
      position: absolute !important;
    }
  `;
  document.head.appendChild(style);
}

beforeEach(async () => {
  await page.viewport(__VRT_VIEWPORT__.width, __VRT_VIEWPORT__.height);
  freezeAnimations();
});

afterEach(async (context) => {
  applyLegacySnapshotSkip(context);
  const story = getStoryContext(context);
  const hooks = story?.parameters?.vrt?.releaseFixedHeader === true ? [releaseFixedHeaderForFullPage()] : [];

  await screenshot(page, context, {
    hooks,
    image: {
      fullPage: true,
      scale: "css",
    },
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
  parameters?: {
    chromatic?: {
      disableSnapshot?: boolean;
    };
    pxdiff?: {
      disable?: boolean;
    };
    screenshot?: {
      skip?: boolean;
    };
    vrt?: {
      releaseFixedHeader?: boolean;
    };
  };
};

function getMutableStoryContext(context: unknown): MutableStoryContext | null {
  const story = getStoryContext(context);
  if (!story) return null;
  const parameters = story.parameters;
  if (!parameters || typeof parameters !== "object") return null;
  return story;
}

function getStoryContext(context: unknown): MutableStoryContext | null {
  if ((typeof context !== "function" && typeof context !== "object") || context === null || !("story" in context)) {
    return null;
  }

  const story = context.story;
  if (!story || typeof story !== "object") return null;
  return story as MutableStoryContext;
}

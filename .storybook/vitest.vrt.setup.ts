import { screenshot } from "@storycap-testrun/browser";
import { afterEach, beforeEach } from "vitest";
import { page } from "vitest/browser";

const VRT_VIEWPORT = {
  width: 1920,
  height: 1080,
} as const;

const FREEZE_STYLE_ID = "vrt-freeze-animations";

// fullPageキャプチャはスクロール＆スティッチ方式のため、タイル撮影中に動く要素があると
// 画像がちぎれる。アニメーションを即時完了させて最終状態で静止させる
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

beforeEach(async () => {
  await page.viewport(VRT_VIEWPORT.width, VRT_VIEWPORT.height);
  freezeAnimations();
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

import { type BrowserScreenshotHook, screenshot } from "@storycap-testrun/browser";
import { afterEach, beforeEach } from "vitest";
import { page } from "vitest/browser";

const VRT_VIEWPORT = {
  width: 1920,
  height: 1080,
} as const;

// 1枚撮りの上限。Chromiumのキャプチャ限界(16384px)とレポートサイズへの配慮
const MAX_CAPTURE_HEIGHT = 8000;

const FREEZE_STYLE_ID = "vrt-freeze-animations";

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

function measureContentHeight() {
  return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
}

// コンテンツがビューポート(1080px)より高いStoryを fullPage: true で撮ると、
// スクロールしながら分割撮影→Canvas結合（スティッチ）が走り、チャンク間のズレで
// 画像がちぎれる。代わりにStoryを描画しているiframeのラッパーをコンテンツの
// 高さまで広げ、スクロール不要の状態にして1枚で撮る
const expandViewportToContent: BrowserScreenshotHook = {
  async preCapture() {
    const wrapper = window.parent?.document.querySelector("iframe[data-vitest]")?.parentElement;
    if (!wrapper) return;
    // dvh基準の要素は拡張後に再レイアウトされるため、高さが安定するまで再測定する
    for (let i = 0; i < 3; i++) {
      const target = Math.min(Math.max(measureContentHeight(), VRT_VIEWPORT.height), MAX_CAPTURE_HEIGHT);
      if (wrapper.getBoundingClientRect().height >= target) break;
      wrapper.style.height = `${target}px`;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  },
};

beforeEach(async () => {
  await page.viewport(VRT_VIEWPORT.width, VRT_VIEWPORT.height);
  freezeAnimations();
});

afterEach(async (context) => {
  applyLegacySnapshotSkip(context);
  const needsExpansion = measureContentHeight() > VRT_VIEWPORT.height;
  await screenshot(page, context, {
    // 縦長Storyは fullPage: false + iframe拡張で1枚撮り（スティッチ回避）。
    // ビューポート内に収まるStoryは従来どおりbody要素のキャプチャ
    fullPage: !needsExpansion,
    scale: "css",
    hooks: needsExpansion ? [expandViewportToContent] : [],
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

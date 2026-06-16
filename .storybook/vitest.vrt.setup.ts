import { type BrowserScreenshotHook, screenshot } from "@storycap-testrun/browser";
import { afterEach, beforeEach } from "vitest";
import { page } from "vitest/browser";

type ViewportSize = {
  width: number;
  height: number;
};

const MOBILE_VIEWPORTS = {
  mobile1: { width: 320, height: 568 },
  mobile2: { width: 414, height: 896 },
} satisfies Record<string, ViewportSize>;

// 1枚撮りの上限。Chromiumのキャプチャ限界(16384px)とレポートサイズへの配慮
const MAX_CAPTURE_HEIGHT = 8000;

const FREEZE_STYLE_ID = "vrt-freeze-animations";
let baseViewport: ViewportSize | null = null;

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

function getVitestIframeWrapper() {
  return window.parent.document.querySelector("iframe[data-vitest]")?.parentElement ?? null;
}

function measureCurrentViewport(): ViewportSize {
  const wrapper = getVitestIframeWrapper();
  const rect = wrapper?.getBoundingClientRect();
  return {
    width: Math.round(rect?.width || window.innerWidth),
    height: Math.round(rect?.height || window.innerHeight),
  };
}

function getBaseViewport() {
  baseViewport ??= measureCurrentViewport();
  return baseViewport;
}

function setIframeViewport(viewport: ViewportSize) {
  const wrapper = getVitestIframeWrapper();
  if (!wrapper) return;
  wrapper.style.width = `${viewport.width}px`;
  wrapper.style.height = `${viewport.height}px`;
  wrapper.style.transform = "none";
  wrapper.style.transformOrigin = "left top";
}

function fixedIframeViewport(viewport: ViewportSize): BrowserScreenshotHook {
  return {
    async setup() {
      setIframeViewport(viewport);
    },
    async preCapture() {
      setIframeViewport(viewport);
    },
  };
}

// コンテンツがビューポートより高いStoryを fullPage: true で撮ると、
// スクロールしながら分割撮影→Canvas結合（スティッチ）が走り、チャンク間のズレで
// 画像がちぎれる。代わりにStoryを描画しているiframeのラッパーをコンテンツの
// 高さまで広げ、スクロール不要の状態にして1枚で撮る
function expandViewportToContent(viewport: ViewportSize): BrowserScreenshotHook {
  return {
    async preCapture() {
      const wrapper = getVitestIframeWrapper();
      if (!wrapper) return;
      // dvh基準の要素は拡張後に再レイアウトされるため、高さが安定するまで再測定する
      for (let i = 0; i < 3; i++) {
        const target = Math.min(Math.max(measureContentHeight(), viewport.height), MAX_CAPTURE_HEIGHT);
        if (wrapper.getBoundingClientRect().height >= target) break;
        wrapper.style.height = `${target}px`;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    },
  };
}

beforeEach(async (context) => {
  const viewport = getMobileViewport(context) ?? getBaseViewport();
  await page.viewport(viewport.width, viewport.height);
  freezeAnimations();
});

afterEach(async (context) => {
  applyLegacySnapshotSkip(context);
  const mobileViewport = getMobileViewport(context);
  const captureViewport = mobileViewport ?? getBaseViewport();
  const needsExpansion = measureContentHeight() > captureViewport.height;
  const hooks = [
    ...(mobileViewport ? [fixedIframeViewport(mobileViewport)] : []),
    ...(needsExpansion ? [expandViewportToContent(captureViewport)] : []),
  ];

  await screenshot(page, context, {
    // 縦長Storyは fullPage: false + iframe拡張で1枚撮り（スティッチ回避）。
    // ビューポート内に収まるStoryは従来どおりbody要素のキャプチャ
    fullPage: !needsExpansion,
    scale: "css",
    hooks,
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
    viewport?: StorybookViewportSetting;
  };
  globals?: {
    viewport?: StorybookViewportSetting;
  };
};

function getMutableStoryContext(context: unknown): MutableStoryContext | null {
  const story = getStoryContext(context);
  if (!story) return null;
  const parameters = story.parameters;
  if (!parameters || typeof parameters !== "object") return null;
  return story;
}

type StorybookViewportSetting =
  | string
  | {
      value?: unknown;
      isRotated?: unknown;
    };

function getMobileViewport(context: unknown): ViewportSize | null {
  const story = getStoryContext(context);
  const viewportSettings = [story?.globals?.viewport, story?.parameters?.viewport];

  for (const setting of viewportSettings) {
    const viewport = resolveMobileViewport(setting);
    if (viewport) return viewport;
  }

  return null;
}

function resolveMobileViewport(setting: StorybookViewportSetting | undefined): ViewportSize | null {
  const viewport = normalizeViewportSetting(setting);
  if (!viewport || !isMobileViewportName(viewport.value)) return null;

  const size = MOBILE_VIEWPORTS[viewport.value];
  if (!viewport.isRotated) return size;

  return {
    width: size.height,
    height: size.width,
  };
}

function normalizeViewportSetting(
  setting: StorybookViewportSetting | undefined,
): { value: string; isRotated: boolean } | null {
  if (typeof setting === "string") {
    return { value: setting, isRotated: false };
  }
  if (!setting || typeof setting !== "object" || typeof setting.value !== "string") {
    return null;
  }

  return {
    value: setting.value,
    isRotated: setting.isRotated === true,
  };
}

function isMobileViewportName(value: string): value is keyof typeof MOBILE_VIEWPORTS {
  return Object.hasOwn(MOBILE_VIEWPORTS, value);
}

function getStoryContext(context: unknown): MutableStoryContext | null {
  if ((typeof context !== "function" && typeof context !== "object") || context === null || !("story" in context)) {
    return null;
  }

  const story = context.story;
  if (!story || typeof story !== "object") return null;
  return story as MutableStoryContext;
}

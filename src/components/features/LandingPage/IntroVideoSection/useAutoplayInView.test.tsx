// @vitest-environment jsdom

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoplayInView } from "./useAutoplayInView";

type ObserverCallback = (
  entries: Array<Pick<IntersectionObserverEntry, "isIntersecting" | "intersectionRatio">>,
) => void;

const observerState = vi.hoisted(() => ({
  callback: undefined as ObserverCallback | undefined,
  created: 0,
  disconnect: vi.fn(),
}));

class IntersectionObserverMock {
  constructor(callback: ObserverCallback) {
    observerState.callback = callback;
    observerState.created += 1;
  }
  observe = vi.fn();
  disconnect = observerState.disconnect;
}

const setReducedMotion = (matches: boolean) => {
  window.matchMedia = vi.fn().mockReturnValue({ matches }) as unknown as typeof window.matchMedia;
};

/** jsdomは再生を実装していないため、pausedとendedを持つ動画を用意する */
const createVideo = ({ rejectPlay = false } = {}) => {
  const video = document.createElement("video");
  const state = { paused: true, ended: false };
  Object.defineProperty(video, "paused", { get: () => state.paused });
  Object.defineProperty(video, "ended", { get: () => state.ended });
  const play = vi.fn(() => {
    if (rejectPlay) return Promise.reject(new Error("NotAllowedError"));
    state.paused = false;
    video.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  const pause = vi.fn(() => {
    state.paused = true;
    video.dispatchEvent(new Event("pause"));
  });
  video.play = play;
  video.pause = pause;
  const finish = () => {
    state.ended = true;
    state.paused = true;
    video.dispatchEvent(new Event("pause"));
  };
  return { video, play, pause, finish };
};

const scrollTo = (intersectionRatio: number) => {
  observerState.callback?.([{ isIntersecting: intersectionRatio > 0, intersectionRatio }]);
};

describe("useAutoplayInView", () => {
  beforeEach(() => {
    observerState.callback = undefined;
    observerState.created = 0;
    observerState.disconnect.mockClear();
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
    setReducedMotion(false);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("半分以上が画面に入ったら音なしで再生する", () => {
    const { video, play } = createVideo();
    renderHook(() => useAutoplayInView({ current: video }));

    scrollTo(0.3);
    expect(play).not.toHaveBeenCalled();

    scrollTo(0.6);
    expect(play).toHaveBeenCalledTimes(1);
    expect(video.muted).toBe(true);
  });

  it("半分未満になったら一時停止し、再び入ったら再開する", () => {
    const { video, play, pause } = createVideo();
    renderHook(() => useAutoplayInView({ current: video }));

    scrollTo(0.6);
    scrollTo(0.2);
    expect(pause).toHaveBeenCalledTimes(1);

    scrollTo(0.6);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("利用者が止めた後は、画面に入り直しても再開しない", () => {
    const { video, play, pause } = createVideo();
    renderHook(() => useAutoplayInView({ current: video }));

    scrollTo(0.6);
    video.pause();
    scrollTo(0);
    scrollTo(0.6);

    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("最後まで再生した後は、画面に入り直しても再開しない", () => {
    const { video, play, finish } = createVideo();
    renderHook(() => useAutoplayInView({ current: video }));

    scrollTo(0.6);
    finish();
    scrollTo(0);
    scrollTo(0.6);

    expect(play).toHaveBeenCalledTimes(1);
  });

  it("動きを減らす設定では、画面を監視せず再生もしない", () => {
    setReducedMotion(true);
    const { video, play } = createVideo();
    renderHook(() => useAutoplayInView({ current: video }));

    scrollTo(0.6);

    expect(observerState.created).toBe(0);
    expect(play).not.toHaveBeenCalled();
  });

  it("ブラウザが再生を拒否しても例外にしない", async () => {
    const { video, play } = createVideo({ rejectPlay: true });
    renderHook(() => useAutoplayInView({ current: video }));

    scrollTo(0.6);

    await expect(play.mock.results[0]?.value).rejects.toThrow("NotAllowedError");
  });

  it("アンマウントすると画面の監視をやめる", () => {
    const { video } = createVideo();
    const { unmount } = renderHook(() => useAutoplayInView({ current: video }));

    unmount();

    expect(observerState.disconnect).toHaveBeenCalledTimes(1);
  });
});

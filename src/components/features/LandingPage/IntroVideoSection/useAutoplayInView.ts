import { type RefObject, useEffect } from "react";

// 動画の半分以上が画面に入ったら再生する
const VISIBLE_RATIO = 0.5;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * 動画が画面に半分以上入ったら音なしで再生し、半分未満になったら一時停止する。
 * 利用者が自分で止めた後と、最後まで再生した後は、画面に入っても再開しない。
 * OSで動きを減らす設定にしている場合は自動再生しない。
 */
export const useAutoplayInView = (videoRef: RefObject<HTMLVideoElement | null>) => {
  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.(REDUCED_MOTION_QUERY).matches) return;

    video.muted = true;
    let pausedForScroll = false;
    let pausedByUser = false;

    const handlePause = () => {
      if (pausedForScroll) {
        pausedForScroll = false;
        return;
      }
      if (!video.ended) pausedByUser = true;
    };
    const handlePlay = () => {
      pausedByUser = false;
    };
    video.addEventListener("pause", handlePause);
    video.addEventListener("play", handlePlay);

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO) {
          if (video.paused && !video.ended && !pausedByUser) {
            // 省電力モードなどで拒否された場合は、再生ボタンから見てもらう
            video.play().catch(() => undefined);
          }
          return;
        }
        if (!video.paused) {
          pausedForScroll = true;
          video.pause();
        }
      },
      { threshold: [0, VISIBLE_RATIO] },
    );
    observer.observe(video);

    return () => {
      observer.disconnect();
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("play", handlePlay);
    };
  }, [videoRef]);
};

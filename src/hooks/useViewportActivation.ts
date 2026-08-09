import { useCallback, useEffect, useState } from "react";

type Options = {
  rootMargin?: string;
  activationKey?: string;
};

/** viewportへ近づいた時点で一度だけ有効化し、その後は有効状態を保持する。 */
export function useViewportActivation<T extends Element>({
  rootMargin = "320px 0px",
  activationKey = "default",
}: Options = {}) {
  const [target, setTarget] = useState<T | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const isActive = activeKey === activationKey;
  const ref = useCallback((node: T | null) => setTarget(node), []);
  const activate = useCallback(() => setActiveKey(activationKey), [activationKey]);

  useEffect(() => {
    if (isActive || !target) return;

    if (typeof IntersectionObserver === "undefined") {
      activate();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) activate();
      },
      { rootMargin },
    );
    observer.observe(target);

    return () => observer.disconnect();
  }, [activate, isActive, rootMargin, target]);

  return { ref, isActive, activate };
}

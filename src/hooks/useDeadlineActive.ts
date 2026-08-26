import { useEffect, useState } from "react";

const MAX_TIMEOUT_DELAY_MS = 2_147_483_647;

export function useDeadlineActive(deadline: number | null | undefined) {
  const [, setClockVersion] = useState(0);

  useEffect(() => {
    if (deadline === null || deadline === undefined) return;

    if (deadline <= Date.now()) return;

    let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
    const scheduleDeadlineCheck = () => {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        setClockVersion((version) => version + 1);
        return;
      }
      timeoutId = globalThis.setTimeout(scheduleDeadlineCheck, Math.min(remainingMs, MAX_TIMEOUT_DELAY_MS));
    };

    scheduleDeadlineCheck();
    return () => {
      if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
    };
  }, [deadline]);

  return deadline !== null && deadline !== undefined && deadline > Date.now();
}

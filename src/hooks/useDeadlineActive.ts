import { useEffect, useState } from "react";

export function useDeadlineActive(deadline: number | null | undefined) {
  const [, setClockVersion] = useState(0);

  useEffect(() => {
    if (deadline === null || deadline === undefined) return;

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return;

    const timeoutId = globalThis.setTimeout(() => setClockVersion((version) => version + 1), remainingMs);
    return () => globalThis.clearTimeout(timeoutId);
  }, [deadline]);

  return deadline !== null && deadline !== undefined && deadline > Date.now();
}

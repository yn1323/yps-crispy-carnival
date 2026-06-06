import { useCallback, useEffect, useRef, useState } from "react";

type MaybePromise<T> = T | Promise<T>;

export function useSingleFlight<TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => MaybePromise<TResult>,
): {
  run: (...args: TArgs) => Promise<TResult | undefined>;
  isRunning: boolean;
} {
  const handlerRef = useRef(handler);
  const runningRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  const run = useCallback(async (...args: TArgs) => {
    if (runningRef.current) return undefined;

    runningRef.current = true;
    setIsRunning(true);
    try {
      return await handlerRef.current(...args);
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  }, []);

  return { run, isRunning };
}

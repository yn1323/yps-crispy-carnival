import { useCallback, useEffect, useRef, useState } from "react";

type MaybePromise<T> = T | Promise<T>;

export function useSingleFlight<TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => MaybePromise<TResult>,
): {
  run: (...args: TArgs) => Promise<TResult | undefined>;
  isRunning: boolean;
  release: () => void;
} {
  const handlerRef = useRef(handler);
  const runningRef = useRef(false);
  const generationRef = useRef(0);
  const isMountedRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const run = useCallback(async (...args: TArgs) => {
    if (runningRef.current) return undefined;

    const generation = ++generationRef.current;
    runningRef.current = true;
    if (isMountedRef.current) setIsRunning(true);
    try {
      return await handlerRef.current(...args);
    } finally {
      if (generationRef.current === generation) {
        runningRef.current = false;
        if (isMountedRef.current) setIsRunning(false);
      }
    }
  }, []);

  const release = useCallback(() => {
    generationRef.current += 1;
    runningRef.current = false;
    if (isMountedRef.current) setIsRunning(false);
  }, []);

  return { run, isRunning, release };
}

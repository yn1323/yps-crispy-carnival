import { Box, Text } from "@chakra-ui/react";
import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      appearance: "interaction-only";
      size: "compact" | "flexible";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": (errorCode: string) => boolean;
    },
  ) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = "cloudflare-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    const handleLoad = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile API was not loaded"));
    };
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", () => reject(new Error("Turnstile script could not be loaded")), { once: true });
    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
  return scriptPromise;
}

export function TurnstileWidget({
  action,
  onError,
  onVerify,
  siteKey,
}: {
  action: string;
  onError: (errorCode?: string) => void;
  onVerify: (token: string) => void;
  siteKey: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteKey) return;
    let disposed = false;
    let widgetId: string | null = null;

    void loadTurnstile()
      .then((api) => {
        if (disposed || !containerRef.current) return;
        widgetId = api.render(containerRef.current, {
          sitekey: siteKey,
          action,
          appearance: "interaction-only",
          size: window.matchMedia("(max-width: 359px)").matches ? "compact" : "flexible",
          callback: onVerify,
          "expired-callback": () => onVerify(""),
          "error-callback": (errorCode) => {
            onError(errorCode);
            return true;
          },
        });
      })
      .catch(() => onError());

    return () => {
      disposed = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [action, onError, onVerify, siteKey]);

  if (!siteKey) {
    return (
      <Text color="red.600" fontSize="sm">
        セキュリティ確認を読み込めませんでした。
      </Text>
    );
  }

  return <Box ref={containerRef} role="group" aria-label="セキュリティ確認" minH="65px" overflowX="auto" />;
}

import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { WEB_MEASUREMENT_RUNTIME_CONFIG } from "@/src/configs/webMeasurement";
import { initializeDocumentWebMeasurement } from "@/src/lib/webMeasurement";

initializeDocumentWebMeasurement({
  config: WEB_MEASUREMENT_RUNTIME_CONFIG,
  currentPathname: window.location.pathname,
  initialDocumentPathname: window.location.pathname,
  viewportWidth: window.innerWidth,
});

const isStaticNotFoundDocument = document.querySelector("[data-static-not-found]") !== null;

function reportCaughtRenderError(): void {
  console.error("Client render error", { errorCode: "client_render_error" });
}

// Cloudflareは任意の未知URLへ同じ404.htmlを返すため、build時URLを持つReact treeはhydrateしない。
if (!isStaticNotFoundDocument) {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
      { onCaughtError: reportCaughtRenderError },
    );
  });
}

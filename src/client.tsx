import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";

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

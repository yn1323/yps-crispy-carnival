import { createFileRoute } from "@tanstack/react-router";
import { CacheResetPage } from "@/src/pages/cache-reset";
import { buildCacheResetPageHead } from "@/src/pages/cache-reset/meta";

export const Route = createFileRoute("/cache-reset")({
  head: buildCacheResetPageHead,
  component: CacheResetPage,
});

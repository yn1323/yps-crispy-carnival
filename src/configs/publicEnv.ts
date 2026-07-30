export const GTM_ID = import.meta.env.VITE_GTM_ID ?? "";

const convexUrl = import.meta.env.VITE_CONVEX_URL ?? "";
export const CONVEX_SITE_URL =
  import.meta.env.VITE_CONVEX_SITE_URL ?? convexUrl.replace(".convex.cloud", ".convex.site");
if (!CONVEX_SITE_URL) {
  throw new Error("Add your Convex Site URL or Convex URL to the .env file");
}

export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";

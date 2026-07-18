export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";
if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error("Add your Clerk Publishable Key to the .env file");
}

export const CONVEX_URL = import.meta.env.VITE_CONVEX_URL ?? "";
if (!CONVEX_URL) {
  throw new Error("Add your Convex URL to the .env file");
}

export const GTM_ID = import.meta.env.VITE_GTM_ID ?? "";

export const CONVEX_SITE_URL =
  import.meta.env.VITE_CONVEX_SITE_URL ?? CONVEX_URL.replace(".convex.cloud", ".convex.site");

export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";

export const ACCOUNT_DELETION_ENABLED = import.meta.env.VITE_ACCOUNT_DELETION_ENABLED === "true";

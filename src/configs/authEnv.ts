export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";
if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error("Add your Clerk Publishable Key to the .env file");
}

export const CONVEX_URL = import.meta.env.VITE_CONVEX_URL ?? "";
if (!CONVEX_URL) {
  throw new Error("Add your Convex URL to the .env file");
}

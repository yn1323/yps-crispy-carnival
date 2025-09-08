import { ConvexHttpClient } from "convex/browser";

export const convex = new ConvexHttpClient(process.env.VITE_CONVEX_URL ?? "");

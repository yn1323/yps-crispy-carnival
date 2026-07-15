import { ConvexHttpClient } from "convex/browser";
import { CONVEX_URL } from "@/src/configs/env";

export const convex = new ConvexHttpClient(CONVEX_URL);

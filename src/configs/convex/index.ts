import { ConvexHttpClient } from "convex/browser";
import { CONVEX_URL } from "@/src/constants/env";

export const convex = new ConvexHttpClient(CONVEX_URL);

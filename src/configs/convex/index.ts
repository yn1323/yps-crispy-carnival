import { ConvexHttpClient } from "convex/browser";
import { CONVEX_URL } from "@/src/configs/authEnv";

export const convex = new ConvexHttpClient(CONVEX_URL);

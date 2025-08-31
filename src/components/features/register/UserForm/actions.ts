"use server";

import { api } from "@/convex/_generated/api";
import { convex } from "@/src/configs/convex";
import type { SchemaType } from "./schema";

export const registerUser = async (userId: string, { userName }: SchemaType) => {
  try {
    // Convexでプロフィール作成
    await convex.mutation(api.auth.createProfile, {
      name: userName,
      authId: userId,
    });

    return { success: true };
  } catch (error) {
    console.error("User registration error:", error);
    return { success: false };
  }
};

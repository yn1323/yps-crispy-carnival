import { api } from "@/convex/_generated/api";
import { convex } from "@/src/configs/convex";
import type { SchemaType } from "./schema";

export const registerUser = async (userId: string, { userName }: SchemaType) => {
  const { success } = await convex
    .mutation(api.user.createUser, {
      name: userName,
      authId: userId,
    })
    .then(() => ({ success: true }))
    .catch(() => ({ success: false }));

  return { success };
};

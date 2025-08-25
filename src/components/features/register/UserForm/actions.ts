"use server";

import type { PostAuthUser } from "@/app/api/auth/user/[userId]/route";
import { serverFetch } from "@/src/services/common/serverFetch";
import type { SchemaType } from "./schema";

export const registerUser = async (userId: string, { userName }: SchemaType) => {
  const { success } = await serverFetch<PostAuthUser>(`/api/auth/user/${userId}`, {
    method: "POST",
    mutation: {
      userId,
      userName,
    },
  });

  return { success };
};

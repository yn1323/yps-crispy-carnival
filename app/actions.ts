"use server";

import type { GetAuthUser } from "@/app/api/auth/user/[userId]/route";
import { serverFetch } from "@/src/services/common/serverFetch";

export const checkUser = async (userId: string) => {
  const result = await serverFetch<GetAuthUser>(`/api/auth/user/${userId}`);

  return result;
};

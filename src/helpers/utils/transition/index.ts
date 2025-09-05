"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { convex } from "@/src/configs/convex";

const getUser = async (authId: string) => {
  try {
    const user = await convex.query(api.user.getUserByAuthId, {
      authId,
    });
    return user;
  } catch (error) {
    console.error("Failed to fetch user profile:", error);
    return false;
  }
};
export const verifySession = async () => {
  const { userId } = await auth();
  if (!userId) {
    redirect("/");
  }

  const user = await getUser(userId);
  if (!user) {
    redirect("/");
  }

  if (!user.isRegistered) {
    redirect("/join/user");
  }
};

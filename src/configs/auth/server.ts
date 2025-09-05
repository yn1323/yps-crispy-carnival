import { createClerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export const logoutAndRedirect = async (userId?: string) => {
  if (userId) {
    redirect("/logout");
  } else {
    redirect("/");
  }
};

export const getClerkClient = async () =>
  await createClerkClient({
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  });

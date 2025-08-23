import { headers } from "next/headers";

export async function isUserRegistered(): Promise<boolean> {
  const headersList = await headers();
  const userRegistered = headersList.get("x-user-registered");
  return userRegistered === "true";
}

import { getClerkClient } from "@/src/configs/auth/server";

export const addRegisterInfo = async ({ userId, isRegistered }: { userId: string; isRegistered: boolean }) => {
  const clerkClient = await getClerkClient();
  clerkClient.users.updateUserMetadata(userId, {
    publicMetadata: { isRegistered },
  });
};

export const getRegisterInfoFromMiddleware = async (userId: string) => {
  const clerkClient = await getClerkClient();
  const user = await clerkClient.users.getUser(userId);
  return !!user.publicMetadata.isRegistered;
};

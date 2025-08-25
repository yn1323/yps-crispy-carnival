import { createClient } from "./server";

export const serverAuth = () => {
  const client = createClient();

  const getUser = async () => (await client).auth.getUser();

  return {
    getUser,
  };
};

export const getSelfInfo = async () => {
  const { getUser } = serverAuth();
  const user = await getUser();

  return {
    userId: user.data.user?.id ?? "",
  };
};

import { Box, Spinner } from "@chakra-ui/react";
import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import { api } from "@/convex/_generated/api";
import { UserSetting } from "@/src/components/features/Setting/UserSetting";
import { userAtom } from "@/src/stores/user";

export const SettingsPage = () => {
  const { authId } = useAtomValue(userAtom);
  const userData = useQuery(api.user.queries.getByAuthId, authId ? { authId } : "skip");

  if (!userData) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <Spinner />
      </Box>
    );
  }

  return <UserSetting user={userData} />;
};

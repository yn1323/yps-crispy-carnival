import { Box } from "@chakra-ui/react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { UserForm } from "@/src/components/features/register/UserForm";

const JoinUserPage = async () => {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minH="70vh">
      <UserForm userId={userId} callbackRoutingPath="/mypage" />
    </Box>
  );
};

export default JoinUserPage;

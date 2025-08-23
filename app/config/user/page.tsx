import { Center } from "@chakra-ui/react";
import { UserForm } from "@/src/components/features/register/UserForm";
import { Animation } from "@/src/components/templates/Animation";
import { getSelfInfo } from "@/src/helpers/auth/auth";

export default async function Page() {
  const { userId } = await getSelfInfo();

  return (
    <Animation>
      <Center h="100vh">
        <UserForm userId={userId} callbackRoutingPath="/mypage" />
      </Center>
    </Animation>
  );
}

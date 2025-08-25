import { Center } from "@chakra-ui/react";
import { UserForm } from "@/src/components/features/register/UserForm";
import { Animation } from "@/src/components/templates/Animation";

export default async function Page() {
  return (
    <Animation>
      <Center h="100vh">
        <UserForm userId={"userId"} callbackRoutingPath="/mypage" />
      </Center>
    </Animation>
  );
}

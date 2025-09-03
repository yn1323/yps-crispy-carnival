import { Center, Heading } from "@chakra-ui/react";
import { Animation } from "@/src/components/templates/Animation";
import { verifySession } from "@/src/helpers/utils/transition";

export default async function SettingsPage() {
  await verifySession();

  return (
    <Animation>
      <Center h="100vh">
        <Heading>設定</Heading>
      </Center>
    </Animation>
  );
}

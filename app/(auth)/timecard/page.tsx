import { Center, Heading } from "@chakra-ui/react";
import { Animation } from "@/src/components/templates/Animation";
import { verifySession } from "@/src/helpers/utils/transition";

export default async function TimeCardPage() {
  await verifySession();

  return (
    <Animation>
      <Center h="100vh">
        <Heading>タイムカード</Heading>
      </Center>
    </Animation>
  );
}

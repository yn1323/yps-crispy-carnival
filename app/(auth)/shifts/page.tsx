import { Center, Heading } from "@chakra-ui/react";
import { Animation } from "@/src/components/templates/Animation";
import { verifySession } from "@/src/helpers/utils/transition";

export default async function ShiftsPage() {
  await verifySession();

  return (
    <Animation>
      <Center h="100vh">
        <Heading>シフト</Heading>
      </Center>
    </Animation>
  );
}

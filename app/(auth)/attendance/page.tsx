import { Center, Heading } from "@chakra-ui/react";
import { Animation } from "@/src/components/templates/Animation";
import { verifySession } from "@/src/helpers/utils/transition";

export default async function AttendancePage() {
  await verifySession();

  return (
    <Animation>
      <Center h="100vh">
        <Heading>勤怠記録</Heading>
      </Center>
    </Animation>
  );
}

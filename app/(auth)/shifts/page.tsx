import { Center, Heading } from "@chakra-ui/react";
import { Animation } from "@/src/components/templates/Animation";

export const runtime = "edge";

export default function ShiftsPage() {
  return (
    <Animation>
      <Center h="100vh">
        <Heading>シフト</Heading>
      </Center>
    </Animation>
  );
}

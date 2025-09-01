import { Center, Heading } from "@chakra-ui/react";
import { Animation } from "@/src/components/templates/Animation";

export const runtime = "edge";

export default function TimeCardPage() {
  return (
    <Animation>
      <Center h="100vh">
        <Heading>タイムカード</Heading>
      </Center>
    </Animation>
  );
}

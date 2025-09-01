import { Center, Heading } from "@chakra-ui/react";
import { Animation } from "@/src/components/templates/Animation";

export const runtime = "edge";

export default function SettingsPage() {
  return (
    <Animation>
      <Center h="100vh">
        <Heading>設定</Heading>
      </Center>
    </Animation>
  );
}

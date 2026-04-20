import { Box, Flex, Icon, Text } from "@chakra-ui/react";
import { LuPlay, LuX } from "react-icons/lu";

type Props = {
  onStart: () => void;
  onDismiss: () => void;
};

/**
 * デモツアーの起動用FAB。右下に浮かせる。
 * 本体（左側）とクローズ（右側）を1枚のピル形に詰めて、催促バー等の
 * 他UIと誤接触しないよう視覚・当たり判定を1つの塊にしている。
 */
export const DemoLauncherFab = ({ onStart, onDismiss }: Props) => (
  <Flex
    position="fixed"
    bottom={{ base: 24, lg: 28 }}
    right={{ base: 4, lg: 6 }}
    zIndex={50}
    align="stretch"
    borderRadius="full"
    overflow="hidden"
    shadow="lg"
    bg="teal.500"
    color="white"
  >
    <Flex
      as="button"
      align="center"
      gap={2}
      pl={5}
      pr={4}
      py={3}
      fontSize={{ base: "sm", lg: "md" }}
      fontWeight={600}
      cursor="pointer"
      onClick={onStart}
      _hover={{ bg: "teal.600" }}
      transition="background 0.12s"
    >
      <Icon boxSize={4}>
        <LuPlay />
      </Icon>
      <Text>はじめての方はこちら</Text>
    </Flex>
    <Box w="1px" bg="teal.400" opacity={0.6} />
    <Flex
      as="button"
      aria-label="案内を閉じる"
      align="center"
      justify="center"
      px={3}
      cursor="pointer"
      onClick={onDismiss}
      _hover={{ bg: "teal.600" }}
      transition="background 0.12s"
    >
      <Icon boxSize={4}>
        <LuX />
      </Icon>
    </Flex>
  </Flex>
);

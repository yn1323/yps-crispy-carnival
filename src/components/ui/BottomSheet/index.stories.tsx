import { Flex, Icon, Text, VStack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LuLogOut, LuSettings, LuStore } from "react-icons/lu";
import { BottomSheet, useBottomSheet } from "./index";

const meta = {
  title: "UI/BottomSheet",
  component: BottomSheet,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof BottomSheet>;

export default meta;
type Story = StoryObj<typeof BottomSheet>;

const BasicExample = () => {
  const { isOpen, onOpenChange } = useBottomSheet(true);

  return (
    <BottomSheet title="メニュー" isOpen={isOpen} onOpenChange={onOpenChange}>
      <VStack align="stretch" gap={0}>
        <Flex align="center" p={3} _hover={{ bg: "gray.100" }} cursor="pointer">
          <Icon as={LuStore} mr={2} />
          <Text>店舗一覧</Text>
        </Flex>
        <Flex align="center" p={3} _hover={{ bg: "gray.100" }} cursor="pointer">
          <Icon as={LuSettings} mr={2} />
          <Text>設定</Text>
        </Flex>
        <Flex align="center" p={3} _hover={{ bg: "gray.100" }} cursor="pointer" color="red.500">
          <Icon as={LuLogOut} mr={2} />
          <Text>ログアウト</Text>
        </Flex>
      </VStack>
    </BottomSheet>
  );
};

export const Basic: Story = {
  render: () => <BasicExample />,
};

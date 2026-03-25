"use client";

import { Box, Flex, Text, VStack } from "@chakra-ui/react";
import { LuMenu } from "react-icons/lu";
import { useBottomSheet } from "@/src/components/ui/BottomSheet";
import { MenuBottomSheet } from "./MenuBottomSheet";

export const BottomMenu = () => {
  const { isOpen, open, onOpenChange, close } = useBottomSheet();

  return (
    <>
      <Box
        as="nav"
        position="fixed"
        bottom={0}
        left={0}
        right={0}
        w="100%"
        zIndex="sticky"
        bg="white"
        borderTopWidth="1px"
        borderTopColor="gray.200"
        boxShadow="0 -2px 8px rgba(0, 0, 0, 0.05)"
      >
        <Flex w="100%" justify="space-around" align="center" h="60px">
          {/* メニュー */}
          <Box flex={1} onClick={open} cursor="pointer">
            <VStack gap={1} py={2} color={isOpen ? "teal.600" : "gray.600"} transition="all 0.15s">
              <LuMenu size={18} />
              <Text fontSize="2xs">メニュー</Text>
            </VStack>
          </Box>
        </Flex>
      </Box>

      <MenuBottomSheet isOpen={isOpen} onOpenChange={onOpenChange} onClose={close} />
    </>
  );
};

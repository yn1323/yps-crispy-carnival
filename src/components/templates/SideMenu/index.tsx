"use client";

import { Box, Button, Icon, Separator, Text, VStack } from "@chakra-ui/react";
import { SignOutButton } from "@clerk/clerk-react";
import { LuLogOut } from "react-icons/lu";

export const SideMenu = () => {
  return (
    <Box h="100vh" w="64" borderRight="1px" borderColor="border" position="fixed" left={0} top={0} zIndex={10}>
      <VStack gap={0} h="full">
        {/* タイトル */}
        <Box p={6} borderBottom="1px" borderColor="border" w="full">
          <Text color="teal.600" fontWeight="semibold">
            シフト管理
          </Text>
        </Box>

        <Box flex={1} />

        <Separator w="full" borderColor="gray.200" />

        {/* ログアウト */}
        <Box px={4} py={6} w="full">
          <SignOutButton>
            <Button width="full" variant="ghost" justifyContent="flex-start" colorPalette="gray">
              <Icon as={LuLogOut} boxSize={5} mr={2} />
              ログアウト
            </Button>
          </SignOutButton>
        </Box>
      </VStack>
    </Box>
  );
};

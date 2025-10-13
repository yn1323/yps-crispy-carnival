"use client";

import { Box, Button, CloseButton, Dialog, Flex, Portal, Text, useDisclosure, VStack } from "@chakra-ui/react";
import { SignOutButton } from "@clerk/clerk-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { FcBusinessman, FcCalendar, FcClock, FcDocument, FcMenu, FcShop, FcUndo } from "react-icons/fc";

const mainNavItems = [
  { href: "/mypage", label: "マイページ", icon: FcBusinessman },
  { href: "/shops", label: "店舗一覧", icon: FcShop },
  { href: "/shifts", label: "シフト", icon: FcCalendar },
  { href: "/attendance", label: "勤怠", icon: FcClock },
] as const;

export const BottomMenu = () => {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { open, onOpen, onClose } = useDisclosure();

  return (
    <>
      {/* Bottom Navigation Bar */}
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
          {/* Main Navigation Items */}
          {mainNavItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = pathname.startsWith(item.href);
            return (
              <Link key={item.href} to={item.href} style={{ flex: 1, textDecoration: "none" }}>
                <VStack
                  gap={1}
                  py={2}
                  cursor="pointer"
                  color={isActive ? "teal.500" : "gray.600"}
                  borderTopWidth="2px"
                  borderTopColor={isActive ? "teal.500" : "transparent"}
                  transition="all 0.15s ease"
                  _hover={{ color: "teal.500" }}
                >
                  <IconComponent size={24} />
                  <Text fontSize="xs" fontWeight={isActive ? "semibold" : "normal"}>
                    {item.label}
                  </Text>
                </VStack>
              </Link>
            );
          })}

          {/* Menu Button */}
          <VStack
            gap={1}
            py={2}
            cursor="pointer"
            color="gray.600"
            flex={1}
            onClick={onOpen}
            transition="all 0.15s ease"
            _hover={{ color: "teal.500" }}
          >
            <FcMenu size={24} />
            <Text fontSize="xs">メニュー</Text>
          </VStack>
        </Flex>
      </Box>

      {/* Menu Modal */}
      <Dialog.Root open={open} onOpenChange={(e) => (e.open ? onOpen() : onClose())}>
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header borderBottomWidth="1px">メニュー</Dialog.Header>
              <Dialog.Body p={2}>
                <VStack gap={2} alignItems="stretch" as="nav">
                  <Link to="/timecard" onClick={onClose}>
                    <Button width="full" variant="ghost" justifyContent="flex-start" colorPalette="gray">
                      <Flex as="span" align="center" gap={2}>
                        <FcDocument size={20} />
                        <span>タイムカード</span>
                      </Flex>
                    </Button>
                  </Link>
                </VStack>
              </Dialog.Body>
              <Dialog.Footer borderTopWidth="1px">
                <SignOutButton>
                  <Button width="full" variant="ghost" justifyContent="flex-start" colorPalette="gray">
                    <Flex as="span" align="center" gap={2}>
                      <FcUndo size={20} />
                      <span>ログアウト</span>
                    </Flex>
                  </Button>
                </SignOutButton>
              </Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <CloseButton pos="absolute" top="2" right="2" />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
};

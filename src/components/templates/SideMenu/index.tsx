"use client";

import { Box, Button, Icon, Text, VStack } from "@chakra-ui/react";
import { SignOutButton } from "@clerk/clerk-react";
import { Link, useLocation } from "@tanstack/react-router";
import { LuCalendar, LuClock, LuLayoutDashboard, LuLogOut, LuSettings, LuStore } from "react-icons/lu";

const menuItems = [
  { href: "/mypage", label: "マイページ", icon: LuLayoutDashboard },
  { href: "/shifts", label: "シフト管理", icon: LuCalendar },
  { href: "/attendance", label: "勤怠記録", icon: LuClock },
  { href: "/shops", label: "店舗一覧", icon: LuStore },
  { href: "/settings", label: "設定", icon: LuSettings },
] as const;

type Props = {
  onlyLogout?: boolean;
};

export const SideMenu = ({ onlyLogout = false }: Props) => {
  const { href } = useLocation();

  return (
    <Box h="100vh" w="64" borderRight="1px" borderColor="border" position="fixed" left={0} top={0} zIndex={10}>
      <VStack gap={4} h="full">
        {/* タイトル */}
        <Box p={6} borderBottom="1px" borderColor="border" w="full">
          <Text color="teal.600" fontWeight="semibold">
            シフト管理
          </Text>
        </Box>

        <VStack gap={2} flex={1} alignItems="stretch" px={4} w="full">
          {!onlyLogout &&
            menuItems.map((item) => {
              const IconComponent = item.icon;
              const selected = href.startsWith(item.href);
              return (
                <Link key={item.href} to={item.href}>
                  <Button
                    width="full"
                    variant="ghost"
                    justifyContent="flex-start"
                    bg={selected ? "teal.50" : "transparent"}
                    color={selected ? "teal.600" : "gray.700"}
                    _hover={{ bg: selected ? "teal.50" : "gray.50" }}
                    transition="all 0.15s"
                  >
                    <IconComponent size={20} />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
        </VStack>

        <Box px={4} w="full">
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

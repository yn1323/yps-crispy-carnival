"use client";

import { Box, Flex, Text, VStack } from "@chakra-ui/react";
import { Link, useLocation } from "@tanstack/react-router";
import { LuCalendar, LuClock, LuLayoutDashboard, LuSettings, LuStore } from "react-icons/lu";

const menuItems = [
  { href: "/mypage", label: "ダッシュボード", icon: LuLayoutDashboard },
  { href: "/shifts", label: "シフト管理", icon: LuCalendar },
  { href: "/attendance", label: "勤怠記録", icon: LuClock },
  { href: "/shops", label: "店舗一覧", icon: LuStore },
  { href: "/settings", label: "設定", icon: LuSettings },
] as const;

export const BottomMenu = () => {
  const { href } = useLocation();

  return (
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
        {menuItems.map((item) => {
          const IconComponent = item.icon;
          const selected = href.startsWith(item.href);
          return (
            <Link key={item.href} to={item.href} style={{ flex: 1, textDecoration: "none" }}>
              <VStack gap={1} py={2} cursor="pointer" color={selected ? "teal.600" : "gray.600"} transition="all 0.15s">
                <IconComponent size={20} />
                <Text fontSize="xs">{item.label}</Text>
              </VStack>
            </Link>
          );
        })}
      </Flex>
    </Box>
  );
};

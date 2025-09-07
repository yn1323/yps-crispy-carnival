"use client";

import { Box, Button, Text, VStack } from "@chakra-ui/react";
import { SignOutButton } from "@clerk/clerk-react";
import { Link } from "@tanstack/react-router";
import { usePathname } from "next/navigation";
import { FcBusinessman, FcCalendar, FcClock, FcDocument, FcUndo } from "react-icons/fc";

const menuItems = [
  { href: "/mypage", label: "マイページ", icon: FcBusinessman },
  { href: "/shifts", label: "シフト", icon: FcCalendar },
  { href: "/attendance", label: "勤怠記録", icon: FcClock },
  { href: "/timecard", label: "タイムカード", icon: FcDocument },
  // { href: "/settings", label: "設定", icon: FcSettings },
] as const;

type Props = {
  onlyLogout?: boolean;
};

export const SideMenu = ({ onlyLogout = false }: Props) => {
  const pathname = usePathname();

  return (
    <Box h="100vh" borderRight="1px" borderColor="border" py={4} px={4} position="fixed" left={0} top={0} zIndex={10}>
      <VStack gap={4} h="full">
        <Text fontSize="xl" fontWeight="bold">
          管理画面
        </Text>

        <VStack gap={2} flex={1} alignItems="stretch">
          {!onlyLogout &&
            menuItems.map((item) => {
              const IconComponent = item.icon;
              return (
                <Link key={item.href} to={item.href}>
                  <Button
                    width="full"
                    variant={pathname === item.href ? "solid" : "ghost"}
                    justifyContent="flex-start"
                    colorPalette={pathname === item.href ? "blue" : "gray"}
                  >
                    <IconComponent size={20} />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
        </VStack>

        <SignOutButton>
          <Button width="full" variant="ghost" justifyContent="flex-start" colorPalette="gray">
            <FcUndo size={20} />
            ログアウト
          </Button>
        </SignOutButton>
      </VStack>
    </Box>
  );
};

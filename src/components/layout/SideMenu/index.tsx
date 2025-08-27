"use client";

import { Box, Button, Text, VStack } from "@chakra-ui/react";
import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FcBusinessman, FcCalendar, FcClock, FcDocument, FcSettings } from "react-icons/fc";
import { IoLogOut, IoMoon, IoSunny } from "react-icons/io5";
import { useColorMode } from "@/src/components/ui/color-mode";
import { signout } from "./actions";

const menuItems = [
  { href: "/mypage", label: "マイページ", icon: FcBusinessman },
  { href: "/shifts", label: "シフト", icon: FcCalendar },
  { href: "/attendance", label: "勤怠記録", icon: FcClock },
  { href: "/timecard", label: "タイムカード", icon: FcDocument },
  { href: "/settings", label: "設定", icon: FcSettings },
];

export const SideMenu = () => {
  const pathname = usePathname();
  const { colorMode, toggleColorMode } = useColorMode();

  return (
    <Box
      h="100vh"
      bg="rgba(255, 255, 255, 0.01)"
      borderRight="1px"
      borderColor="border"
      py={4}
      px={4}
      position="fixed"
      left={0}
      top={0}
      zIndex={10}
    >
      <VStack gap={4} h="full">
        <Text fontSize="xl" fontWeight="bold">
          管理画面
        </Text>

        <VStack gap={2} flex={1} alignItems="stretch">
          {menuItems.map((item) => {
            const IconComponent = item.icon;
            return (
              <Link key={item.href} href={item.href}>
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

        {/* デバッグ用ダークモード切り替え */}
        <Button width="full" variant="ghost" justifyContent="flex-start" colorPalette="blue" onClick={toggleColorMode}>
          {colorMode === "dark" ? <IoSunny size={20} /> : <IoMoon size={20} />}
          {colorMode === "dark" ? "ライトモード" : "ダークモード"}
        </Button>

        <SignOutButton>
          <Button width="full" variant="ghost" justifyContent="flex-start" colorPalette="gray" onClick={signout}>
            <IoLogOut size={20} />
            ログアウト
          </Button>
        </SignOutButton>
      </VStack>
    </Box>
  );
};

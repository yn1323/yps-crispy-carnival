"use client";

import { Box, Button, Icon, Separator, Text, VStack } from "@chakra-ui/react";
import { SignOutButton } from "@clerk/clerk-react";
import { Link, useLocation } from "@tanstack/react-router";
import { LuCalendar, LuLayoutDashboard, LuLogOut, LuSettings, LuStore, LuUsers } from "react-icons/lu";
import { ShopSelector } from "@/src/components/features/Shop/ShopSelector";

// グローバルメニュー（店舗選択に関係なく使える）
const globalMenuItems = [
  { href: "/mypage", label: "マイページ", icon: LuLayoutDashboard },
  { href: "/shops", label: "店舗一覧", icon: LuStore },
  { href: "/settings", label: "設定", icon: LuSettings },
] as const;

type Shop = {
  _id: string;
  shopName: string;
};

type Props = {
  shops?: Shop[];
  selectedShopId: string | null;
  onShopChange: (shop: { shopId: string; shopName: string }) => void;
  onlyLogout?: boolean;
};

export const SideMenu = ({ shops = [], selectedShopId, onShopChange, onlyLogout = false }: Props) => {
  const { href } = useLocation();
  const hasSelectedShop = selectedShopId !== null;

  return (
    <Box h="100vh" w="64" borderRight="1px" borderColor="border" position="fixed" left={0} top={0} zIndex={10}>
      <VStack gap={0} h="full">
        {/* タイトル */}
        <Box p={6} borderBottom="1px" borderColor="border" w="full">
          <Text color="teal.600" fontWeight="semibold">
            シフト管理
          </Text>
        </Box>

        {!onlyLogout && (
          <>
            {/* 店舗セレクター */}
            <Box px={4} py={4} w="full">
              <ShopSelector
                shops={shops}
                selectedShopId={selectedShopId}
                onShopChange={onShopChange}
                isLoading={shops === undefined}
              />
            </Box>

            {/* 店舗コンテキストメニュー */}
            <VStack gap={2} alignItems="stretch" px={4} w="full">
              {/* スタッフ一覧 */}
              {hasSelectedShop ? (
                <Link to="/shops/$shopId/staffs" params={{ shopId: selectedShopId }}>
                  <Button
                    width="full"
                    variant="ghost"
                    justifyContent="flex-start"
                    bg={href.includes("/staffs") ? "teal.50" : "transparent"}
                    color={href.includes("/staffs") ? "teal.600" : "gray.700"}
                    _hover={{ bg: href.includes("/staffs") ? "teal.50" : "gray.50" }}
                    transition="all 0.15s"
                  >
                    <LuUsers size={20} />
                    スタッフ一覧
                  </Button>
                </Link>
              ) : (
                <Button
                  width="full"
                  variant="ghost"
                  justifyContent="flex-start"
                  color="gray.400"
                  disabled
                  cursor="not-allowed"
                >
                  <LuUsers size={20} />
                  スタッフ一覧
                </Button>
              )}

              {/* シフト管理 */}
              {hasSelectedShop ? (
                <Link to="/shifts">
                  <Button
                    width="full"
                    variant="ghost"
                    justifyContent="flex-start"
                    bg={href.startsWith("/shifts") ? "teal.50" : "transparent"}
                    color={href.startsWith("/shifts") ? "teal.600" : "gray.700"}
                    _hover={{ bg: href.startsWith("/shifts") ? "teal.50" : "gray.50" }}
                    transition="all 0.15s"
                  >
                    <LuCalendar size={20} />
                    シフト管理
                  </Button>
                </Link>
              ) : (
                <Button
                  width="full"
                  variant="ghost"
                  justifyContent="flex-start"
                  color="gray.400"
                  disabled
                  cursor="not-allowed"
                >
                  <LuCalendar size={20} />
                  シフト管理
                </Button>
              )}
            </VStack>

            <Separator my={4} w="full" borderColor="gray.200" />

            {/* グローバルメニュー */}
            <VStack gap={2} flex={1} alignItems="stretch" px={4} w="full">
              {globalMenuItems.map((item) => {
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
          </>
        )}

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

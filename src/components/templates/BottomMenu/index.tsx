"use client";

import { Box, Flex, Text, VStack } from "@chakra-ui/react";
import { Link, useLocation } from "@tanstack/react-router";
import { LuCalendar, LuLayoutDashboard, LuMenu, LuUsers } from "react-icons/lu";
import { useBottomSheet } from "@/src/components/ui/BottomSheet";
import { MenuBottomSheet } from "./MenuBottomSheet";

type Shop = {
  _id: string;
  shopName: string;
};

type BottomMenuProps = {
  shops: Shop[];
  selectedShopId: string | null;
  onShopChange: (shop: { shopId: string; shopName: string }) => void;
};

export const BottomMenu = ({ shops, selectedShopId, onShopChange }: BottomMenuProps) => {
  const { href } = useLocation();
  const { isOpen, open, close, onOpenChange } = useBottomSheet();

  const staffHref = selectedShopId ? `/shops/${selectedShopId}/staffs` : null;

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
          {/* マイページ */}
          <Link to="/mypage" style={{ flex: 1, textDecoration: "none" }}>
            <VStack
              gap={1}
              py={2}
              cursor="pointer"
              color={href.startsWith("/mypage") ? "teal.600" : "gray.600"}
              transition="all 0.15s"
            >
              <LuLayoutDashboard size={20} />
              <Text fontSize="xs">マイページ</Text>
            </VStack>
          </Link>

          {/* シフト */}
          <Link to="/shifts" style={{ flex: 1, textDecoration: "none" }}>
            <VStack
              gap={1}
              py={2}
              cursor="pointer"
              color={href.startsWith("/shifts") ? "teal.600" : "gray.600"}
              transition="all 0.15s"
            >
              <LuCalendar size={20} />
              <Text fontSize="xs">シフト</Text>
            </VStack>
          </Link>

          {/* スタッフ（動的URL） */}
          {staffHref ? (
            <Link to={staffHref} style={{ flex: 1, textDecoration: "none" }}>
              <VStack
                gap={1}
                py={2}
                cursor="pointer"
                color={href.includes("/staffs") ? "teal.600" : "gray.600"}
                transition="all 0.15s"
              >
                <LuUsers size={20} />
                <Text fontSize="xs">スタッフ</Text>
              </VStack>
            </Link>
          ) : (
            <Box flex={1} onClick={open} cursor="pointer">
              <VStack gap={1} py={2} color="gray.600" transition="all 0.15s">
                <LuUsers size={20} />
                <Text fontSize="xs">スタッフ</Text>
              </VStack>
            </Box>
          )}

          {/* メニュー */}
          <Box flex={1} onClick={open} cursor="pointer">
            <VStack gap={1} py={2} color={isOpen ? "teal.600" : "gray.600"} transition="all 0.15s">
              <LuMenu size={20} />
              <Text fontSize="xs">メニュー</Text>
            </VStack>
          </Box>
        </Flex>
      </Box>

      <MenuBottomSheet
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        onClose={close}
        shops={shops}
        selectedShopId={selectedShopId}
        onShopChange={onShopChange}
      />
    </>
  );
};

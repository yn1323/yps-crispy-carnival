"use client";

import { Badge, Box, Button, Card, Heading, HStack, IconButton, Stack, Text } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAtom } from "jotai";
import { LuPencil, LuPlus } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { uniqueBy } from "@/src/helpers/utils/array";
import { userAtom } from "@/src/stores/user";

type ShopCardProps = {
  shop: Doc<"shops"> & { role: string };
};

const ShopCard = ({ shop }: ShopCardProps) => {
  const getSubmitFrequencyLabel = (freq: string) => {
    if (freq === "1w") return "週1回";
    if (freq === "2w") return "2週間ごと";
    return "1ヶ月ごと";
  };

  return (
    <Card.Root _hover={{ transform: "translateY(-2px)", shadow: "lg" }} transition="all 0.15s ease">
      <Link to="/shops/$id" params={{ id: shop._id }}>
        <Card.Body>
          <Box display="flex" justifyContent="space-between" alignItems="center" gap="4">
            <Box flex="1" minW="0">
              <HStack alignItems="center" justifyContent="space-between">
                <Heading size="lg" mb="2" truncate>
                  {shop.shopName}
                </Heading>
                <IconButton
                  aria-label="編集"
                  size="sm"
                  variant="ghost"
                  flexShrink="0"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // TODO: 編集画面への遷移
                    console.log("Edit shop:", shop._id);
                  }}
                >
                  <LuPencil />
                </IconButton>
              </HStack>
              <HStack display="flex" flexWrap="wrap" gap="4" alignItems="flex-end" justifyContent="space-between">
                <Box>
                  <Text color="fg.muted" fontSize={["sm", "md"]} whiteSpace="nowrap">
                    {shop.openTime} - {shop.closeTime}
                  </Text>
                  <Text color="fg.muted" fontSize={["sm", "md"]} whiteSpace="nowrap">
                    シフト提出：{getSubmitFrequencyLabel(shop.submitFrequency)}
                  </Text>
                </Box>
                <Badge colorPalette={shop.useTimeCard ? "teal" : "gray"} size="sm">
                  タイムカード利用： {shop.useTimeCard ? "有効" : "無効"}
                </Badge>
              </HStack>
            </Box>
          </Box>
        </Card.Body>
      </Link>
    </Card.Root>
  );
};

const EmptyState = () => {
  return (
    <Box textAlign="center" py="20">
      <Stack gap="6" alignItems="center">
        <Heading size="lg" color="fg.muted">
          店舗がまだ登録されていません
        </Heading>
        <Text color="fg.muted">まずは店舗を登録してシフト管理を始めましょう</Text>
        <Link to="/shops/new">
          <Button colorPalette="teal" size="lg">
            <LuPlus />
            店舗を登録する
          </Button>
        </Link>
      </Stack>
    </Box>
  );
};

export const ShopsList = () => {
  const [user] = useAtom(userAtom);
  const shops = useQuery(api.shop.getShopsByAuthId, user.authId ? { authId: user.authId } : "skip");

  // 店舗IDで重複排除
  const uniqueShops = shops ? uniqueBy(shops, ["_id"]) : [];

  if (!uniqueShops || uniqueShops.length === 0) {
    return <EmptyState />;
  }

  return (
    <Stack gap="6" w="full">
      <Heading size="xl">店舗一覧</Heading>
      <Stack gap="4">
        {uniqueShops.map((shop) => (
          <ShopCard key={shop._id} shop={shop} />
        ))}
      </Stack>
    </Stack>
  );
};

import { Badge, Box, Flex, HStack, Stack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuStore } from "react-icons/lu";
import { DrilldownRow } from "@/src/components/ui/DrilldownRow";
import { Empty } from "@/src/components/ui/Empty";
import type { UserDetailData } from "./types";

type Props = {
  data: UserDetailData;
  showShopMembershipAddition: boolean;
  onOpenShop: (shopId: string) => void;
};

export function UserShopMembershipList({ data, showShopMembershipAddition, onOpenShop }: Props) {
  if (data.memberships.length === 0) {
    return (
      <Empty
        icon={LuStore}
        title="所属店舗はありません"
        titleAs="h4"
        description={
          showShopMembershipAddition && data.canWrite
            ? "「所属店舗を変更する」から、このユーザーの所属を変更できます。"
            : "所属している店舗はありません。"
        }
        variant="section"
        py={8}
      />
    );
  }

  return (
    <Box borderRadius="lg" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
      <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
        {data.memberships.map((membership) => {
          const isLineActive = membership.line.isLinked && membership.line.isFollowing;
          return (
            <DrilldownRow
              key={membership.shopId}
              id={`user-shop-${membership.shopId}`}
              ariaLabel={`${membership.shopName}の詳細を開く`}
              title={membership.shopName}
              leading={<ShopIcon />}
              badges={
                <HStack gap={1.5} wrap="wrap" ms="auto" flexShrink={0}>
                  {membership.shopStatus !== "active" && (
                    <StatusBadge colorPalette={membership.shopStatus === "archived" ? "gray" : "orange"}>
                      {membership.shopStatus === "archived" ? "アーカイブ済み" : "プラン停止中"}
                    </StatusBadge>
                  )}
                  {membership.excludedFromShift && <StatusBadge colorPalette="gray">シフト対象外</StatusBadge>}
                  <StatusBadge colorPalette={isLineActive ? "green" : "gray"}>
                    {isLineActive ? "LINE連携済み" : "LINE未連携"}
                  </StatusBadge>
                </HStack>
              }
              accessibleDescription="通知、LINE連携、店舗設定を確認できます。"
              onClick={() => onOpenShop(membership.shopId)}
            />
          );
        })}
      </Stack>
    </Box>
  );
}

function ShopIcon() {
  return (
    <Flex
      boxSize="40px"
      borderRadius="full"
      bg="teal.100"
      color="teal.700"
      align="center"
      justify="center"
      fontSize="lg"
      flexShrink={0}
      aria-hidden
    >
      <LuStore />
    </Flex>
  );
}

function StatusBadge({ colorPalette, children }: { colorPalette: "gray" | "orange" | "green"; children: ReactNode }) {
  return (
    <Badge colorPalette={colorPalette} variant="subtle" borderRadius="full" px={2} textStyle="2xs">
      {children}
    </Badge>
  );
}

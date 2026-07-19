import { Badge, Box, Flex, HStack, Link, Stack, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LuChevronRight, LuStore } from "react-icons/lu";
import { Empty } from "@/src/components/ui/Empty";
import type { UserDetailData } from "./types";

export function UserShopMembershipList({ data }: { data: UserDetailData }) {
  if (data.shops.length === 0) {
    return (
      <Empty
        icon={LuStore}
        title="グループに店舗はありません"
        titleAs="h4"
        description="店舗が追加されると、ここに所属状況が表示されます。"
        variant="section"
        py={8}
      />
    );
  }

  return (
    <Box borderRadius="lg" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
      <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
        {data.shops.map((shop) => {
          const membership = data.memberships.find((candidate) => candidate.shopId === shop.shopId) ?? null;
          const isLineActive = Boolean(membership?.line.isLinked && membership.line.isFollowing);
          return (
            <Link
              key={shop.shopId}
              asChild
              display="block"
              color="inherit"
              textDecoration="none"
              transition="background-color 150ms ease"
              _hover={{ bg: "blackAlpha.50", textDecoration: "none" }}
              _focusVisible={{
                outlineWidth: "2px",
                outlineStyle: "solid",
                outlineColor: "teal.500",
                outlineOffset: "-2px",
              }}
            >
              <RouterLink to="/dashboard" search={{ shop: shop.shopId }}>
                <HStack gap={3} px={{ base: 3, lg: 4 }} py={3.5} align="center" minH="68px">
                  <Flex
                    boxSize="40px"
                    borderRadius="full"
                    bg="teal.50"
                    color="teal.700"
                    align="center"
                    justify="center"
                    fontSize="lg"
                    flexShrink={0}
                    aria-hidden
                  >
                    <LuStore />
                  </Flex>
                  <Flex
                    direction={{ base: "column-reverse", sm: "row" }}
                    align={{ base: "flex-start", sm: "center" }}
                    gap={{ base: 1, sm: 2 }}
                    flex={1}
                    minW={0}
                    wrap="wrap"
                  >
                    <Text fontWeight={500} color="gray.900" truncate minW={0}>
                      {shop.shopName}
                    </Text>
                    <HStack gap={1.5} wrap="wrap">
                      {shop.shopStatus !== "active" && (
                        <StatusBadge colorPalette={shop.shopStatus === "archived" ? "gray" : "orange"}>
                          {shop.shopStatus === "archived" ? "アーカイブ済み" : "プラン停止中"}
                        </StatusBadge>
                      )}
                      {!membership ? (
                        <StatusBadge colorPalette="gray">未所属</StatusBadge>
                      ) : (
                        <>
                          {membership.excludedFromShift && <StatusBadge colorPalette="gray">シフト対象外</StatusBadge>}
                          <StatusBadge colorPalette={isLineActive ? "green" : "gray"}>
                            {isLineActive ? "LINE連携済み" : "LINE未連携"}
                          </StatusBadge>
                        </>
                      )}
                    </HStack>
                  </Flex>
                  <Flex color="fg.muted" fontSize="lg" flexShrink={0} aria-hidden>
                    <LuChevronRight />
                  </Flex>
                </HStack>
              </RouterLink>
            </Link>
          );
        })}
      </Stack>
    </Box>
  );
}

function StatusBadge({ colorPalette, children }: { colorPalette: "gray" | "orange" | "green"; children: ReactNode }) {
  return (
    <Badge colorPalette={colorPalette} variant="subtle" borderRadius="full" px={2} textStyle="2xs">
      {children}
    </Badge>
  );
}

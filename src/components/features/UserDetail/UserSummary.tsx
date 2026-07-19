import { Badge, Box, Flex, HStack, Stack, Text } from "@chakra-ui/react";
import { Select } from "@/src/components/ui/Select";
import type { UserDetailData, UserDetailMembership } from "./types";

type Props = {
  data: UserDetailData;
  selectedMembership: UserDetailMembership | null;
  onSelectShop: (shopId: string) => void;
};

export function UserSummary({ data, selectedMembership, onSelectShop }: Props) {
  const initial = data.person.name.trim().charAt(0) || "?";
  const activeLineCount = data.memberships.filter(
    (membership) => membership.line.isLinked && membership.line.isFollowing,
  ).length;
  const needsShopSelector = data.memberships.length > 1 || (data.memberships.length > 0 && !selectedMembership);

  return (
    <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" p={{ base: 4, md: 5 }}>
      <Flex direction={{ base: "column", md: "row" }} align={{ base: "stretch", md: "center" }} gap={4}>
        <HStack flex={1} minW={0} gap={3} align="center">
          <Flex
            boxSize="52px"
            borderRadius="full"
            bg={data.managerRole !== "none" ? "teal.500" : "teal.50"}
            color={data.managerRole !== "none" ? "white" : "teal.700"}
            align="center"
            justify="center"
            fontWeight="semibold"
            fontSize="lg"
            flexShrink={0}
          >
            {initial}
          </Flex>
          <Stack gap={1} minW={0}>
            <HStack gap={2} wrap="wrap">
              <Text fontSize={{ base: "lg", md: "xl" }} fontWeight="semibold" color="gray.900" truncate>
                {data.person.name}
              </Text>
              {data.managerRole === "active" && (
                <Badge colorPalette="teal" variant="subtle" borderRadius="full" px={2.5}>
                  管理者
                </Badge>
              )}
              {data.managerRole === "readOnly" && (
                <Badge colorPalette="gray" variant="subtle" borderRadius="full" px={2.5}>
                  閲覧のみの管理者
                </Badge>
              )}
              {data.managerRole === "none" && data.hasManagerInvitation && (
                <Badge colorPalette="orange" variant="subtle" borderRadius="full" px={2.5}>
                  管理者招待中
                </Badge>
              )}
              <Badge colorPalette="gray" variant="subtle" borderRadius="full" px={2.5}>
                {data.memberships.length > 0 ? `${data.memberships.length}店舗に所属` : "店舗未所属"}
              </Badge>
              {data.memberships.length > 0 && (
                <Badge
                  colorPalette={activeLineCount > 0 ? "green" : "gray"}
                  variant="subtle"
                  borderRadius="full"
                  px={2.5}
                >
                  LINE {activeLineCount}/{data.memberships.length}店舗
                </Badge>
              )}
            </HStack>
            <Text fontSize="sm" color="fg.muted" truncate>
              {data.person.email || "メールアドレス未登録"}
            </Text>
          </Stack>
        </HStack>

        {needsShopSelector ? (
          <Select
            aria-label="表示する店舗"
            label="表示する店舗"
            items={data.memberships.map((membership) => ({
              value: membership.shopId,
              label: `${membership.shopName}${getShopStatusSuffix(membership.shopStatus)}`,
            }))}
            value={selectedMembership?.shopId}
            onChange={onSelectShop}
            placeholder="所属店舗を選択"
            w={{ base: "full", md: "260px" }}
            flexShrink={0}
          />
        ) : selectedMembership ? (
          <Stack gap={0.5} minW={{ md: "180px" }} align={{ base: "flex-start", md: "flex-end" }}>
            <Text fontSize="xs" color="fg.muted">
              表示中の店舗
            </Text>
            <Text fontSize="sm" fontWeight="semibold" color="gray.900">
              {selectedMembership.shopName}
            </Text>
            {selectedMembership.shopStatus !== "active" && (
              <Badge colorPalette="orange" variant="subtle">
                {selectedMembership.shopStatus === "archived" ? "アーカイブ済み" : "プラン停止中"}
              </Badge>
            )}
          </Stack>
        ) : null}
      </Flex>
    </Box>
  );
}

function getShopStatusSuffix(shopStatus: UserDetailMembership["shopStatus"]) {
  switch (shopStatus) {
    case "archived":
      return "（アーカイブ済み）";
    case "planSuspended":
      return "（プラン停止中）";
    case "active":
      return "";
  }
}

import { Badge, Flex, HStack, Text } from "@chakra-ui/react";
import { LuStore } from "react-icons/lu";
import { DrilldownRow } from "@/src/components/ui/DrilldownRow";

export type OrganizationPersonRowData = {
  id: string;
  name: string;
  managerRole: "active" | "readOnly" | "none";
  isLineConnected?: boolean;
  shopNames: readonly string[];
};

type Props = {
  person: OrganizationPersonRowData;
  idPrefix: string;
  showLineConnection?: boolean;
  showShopNames?: boolean;
  onOpen: () => void;
};

export function OrganizationPersonRow({
  person,
  idPrefix,
  showLineConnection = true,
  showShopNames = true,
  onOpen,
}: Props) {
  const initial = person.name.trim().charAt(0) || "?";
  const isManager = person.managerRole !== "none";
  const roleLabel = isManager ? "管理者" : "スタッフ";
  const shopNames = person.shopNames.length > 0 ? person.shopNames.join("、") : "なし";

  return (
    <DrilldownRow
      id={`${idPrefix}-${person.id}`}
      ariaLabel={`${person.name}のスタッフ詳細を開く`}
      title={person.name}
      highlighted={isManager}
      onClick={onOpen}
      leading={
        <Flex
          boxSize="40px"
          borderRadius="full"
          bg={isManager ? "teal.500" : "teal.100"}
          color={isManager ? "white" : "teal.700"}
          align="center"
          justify="center"
          fontWeight="semibold"
          fontSize="sm"
          flexShrink={0}
        >
          {initial}
        </Flex>
      }
      badges={
        <HStack gap={1.5} wrap="wrap" ms="auto" flexShrink={0}>
          <Badge
            colorPalette={isManager ? "teal" : "gray"}
            variant="subtle"
            bg={isManager ? "teal.100" : undefined}
            borderRadius="full"
            px={2}
            textStyle="2xs"
          >
            {roleLabel}
          </Badge>
          {showLineConnection && person.isLineConnected && (
            <Badge colorPalette="green" variant="subtle" borderRadius="full" px={2} textStyle="2xs">
              LINE連携済み
            </Badge>
          )}
        </HStack>
      }
      secondary={
        showShopNames ? (
          <HStack display={{ base: "none", md: "flex" }} gap={1.5} color="fg.muted" minW={0}>
            <LuStore aria-hidden />
            <Text fontSize="xs" truncate>
              {shopNames}
            </Text>
          </HStack>
        ) : undefined
      }
      accessibleDescription={
        <>
          {roleLabel}です。{showLineConnection && person.isLineConnected ? "LINEと連携済みです。" : ""}
          {showShopNames ? (shopNames === "なし" ? "所属店舗はありません。" : `所属店舗は${shopNames}です。`) : ""}
        </>
      }
    />
  );
}

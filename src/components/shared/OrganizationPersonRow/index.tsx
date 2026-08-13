import { Badge, Flex, HStack, Text } from "@chakra-ui/react";
import { LuStore } from "react-icons/lu";
import { DrilldownRow } from "@/src/components/ui/DrilldownRow";

export type OrganizationPersonRowData = {
  id: string;
  name: string;
  managerRole: "active" | "readOnly" | "none";
  lineStatus?: "unlinked" | "linked_following" | "linked_unfollowed";
  /** canonical queryへの切替中だけ使う旧DTO互換。 */
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
  const lineStatus = person.lineStatus ?? (person.isLineConnected ? "linked_following" : "unlinked");
  const linePresentation = getLinePresentation(lineStatus);
  const shopNames = person.shopNames.length > 0 ? person.shopNames.join("、") : "なし";
  const hasNoShopMembership = showShopNames && person.shopNames.length === 0;
  const badgeColumns = showShopNames
    ? showLineConnection
      ? "96px 64px 96px"
      : "96px 64px"
    : showLineConnection
      ? "64px 96px"
      : "64px";

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
        <Flex display="grid" gridTemplateColumns={badgeColumns} gap={1.5} ms="auto" flexShrink={0} alignItems="center">
          <Flex minW={0}>
            {hasNoShopMembership && (
              <Badge colorPalette="gray" variant="subtle" borderRadius="full" px={2} textStyle="2xs">
                所属店舗なし
              </Badge>
            )}
          </Flex>
          <Flex minW={0}>
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
          </Flex>
          <Flex minW={0}>
            {showLineConnection && (
              <Badge
                colorPalette={linePresentation.colorPalette}
                variant="subtle"
                borderRadius="full"
                px={2}
                textStyle="2xs"
              >
                {linePresentation.label}
              </Badge>
            )}
          </Flex>
        </Flex>
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
          {roleLabel}です。{showLineConnection ? `${linePresentation.description}。` : ""}
          {showShopNames ? (shopNames === "なし" ? "所属店舗はありません。" : `所属店舗は${shopNames}です。`) : ""}
        </>
      }
    />
  );
}

function getLinePresentation(status: NonNullable<OrganizationPersonRowData["lineStatus"]>) {
  if (status === "linked_following") {
    return { label: "LINE連携済み", description: "LINEで通知できます", colorPalette: "green" as const };
  }
  if (status === "linked_unfollowed") {
    return { label: "LINE通知不可", description: "現在はLINEで通知できません", colorPalette: "orange" as const };
  }
  return { label: "LINE未連携", description: "LINEは未連携です", colorPalette: "gray" as const };
}

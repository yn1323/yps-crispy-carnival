import { Badge, Flex, HStack, Text } from "@chakra-ui/react";
import { LuStore } from "react-icons/lu";
import { DrilldownRow } from "@/src/components/ui/DrilldownRow";

export type StaffListRowLineStatus = "unlinked" | "linked_following" | "linked_unfollowed";

export type StaffListRowRole = "manager" | "staff";

export type StaffListRowBadge =
  | { kind: "role" }
  | { kind: "line"; status: StaffListRowLineStatus }
  | { kind: "shiftExcluded" };

export type StaffListRowDetail = { kind: "shopNames"; names: readonly string[] } | { kind: "email"; value: string };

type Props = {
  id?: string;
  name: string;
  role: StaffListRowRole;
  detail?: StaffListRowDetail;
  badges?: readonly StaffListRowBadge[];
  onOpen: () => void;
  onOpenIntent?: () => void;
};

export function StaffListRow({ id, name, role, detail, badges = [], onOpen, onOpenIntent }: Props) {
  const initial = name.trim().charAt(0) || "?";
  const isManager = role === "manager";
  const roleLabel = isManager ? "管理者" : "スタッフ";
  const shopNames = detail?.kind === "shopNames" ? (detail.names.length > 0 ? detail.names.join("、") : "なし") : null;
  const hasNoShopMembership = detail?.kind === "shopNames" && detail.names.length === 0;
  const lineBadge = badges.find((badge) => badge.kind === "line");
  const linePresentation = lineBadge?.kind === "line" ? getLinePresentation(lineBadge.status) : null;
  const isShiftExcluded = badges.some((badge) => badge.kind === "shiftExcluded");
  const hasBadges = hasNoShopMembership || badges.length > 0;

  return (
    <DrilldownRow
      id={id}
      ariaLabel={`${name}のスタッフ詳細を開く`}
      title={name}
      highlighted={isManager}
      onClick={onOpen}
      onOpenIntent={onOpenIntent}
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
          letterSpacing="0.02em"
          flexShrink={0}
        >
          {initial}
        </Flex>
      }
      badges={
        hasBadges ? (
          <Flex
            gap={1.5}
            ms="auto"
            w={{ base: "full", sm: "auto" }}
            maxW="full"
            flexShrink={{ base: 1, sm: 0 }}
            alignItems="center"
            justify="flex-end"
            wrap="wrap"
          >
            {hasNoShopMembership && <StatusBadge colorPalette="gray">所属店舗なし</StatusBadge>}
            {badges.map((badge) => (
              <StaffBadge key={badge.kind} badge={badge} role={role} />
            ))}
          </Flex>
        ) : undefined
      }
      secondary={
        detail?.kind === "shopNames" ? (
          <HStack display={{ base: "none", md: "flex" }} gap={1.5} color="fg.muted" minW={0}>
            <LuStore aria-hidden />
            <Text fontSize="xs" truncate>
              {shopNames}
            </Text>
          </HStack>
        ) : detail?.kind === "email" ? (
          <Text fontSize="xs" color="fg.muted" display={{ base: "none", lg: "block" }} truncate>
            {detail.value}
          </Text>
        ) : undefined
      }
      accessibleDescription={
        <>
          {roleLabel}です。{linePresentation ? `${linePresentation.description}。` : ""}
          {shopNames ? (shopNames === "なし" ? "所属店舗はありません。" : `所属店舗は${shopNames}です。`) : ""}
          {isShiftExcluded ? "シフト対象外です。" : ""}
        </>
      }
    />
  );
}

function StaffBadge({ badge, role }: { badge: StaffListRowBadge; role: StaffListRowRole }) {
  if (badge.kind === "role") {
    const isManager = role === "manager";
    return (
      <StatusBadge colorPalette={isManager ? "teal" : "gray"} bg={isManager ? "teal.100" : undefined}>
        {isManager ? "管理者" : "スタッフ"}
      </StatusBadge>
    );
  }

  if (badge.kind === "line") {
    const presentation = getLinePresentation(badge.status);
    return <StatusBadge colorPalette={presentation.colorPalette}>{presentation.label}</StatusBadge>;
  }

  return <StatusBadge colorPalette="gray">シフト対象外</StatusBadge>;
}

function StatusBadge({
  colorPalette,
  bg,
  children,
}: {
  colorPalette: "teal" | "green" | "orange" | "gray";
  bg?: string;
  children: string;
}) {
  return (
    <Badge colorPalette={colorPalette} variant="subtle" bg={bg} borderRadius="full" px={2} textStyle="2xs">
      {children}
    </Badge>
  );
}

function getLinePresentation(status: StaffListRowLineStatus) {
  if (status === "linked_following") {
    return { label: "LINE連携済み", description: "LINEで通知できます", colorPalette: "green" as const };
  }
  if (status === "linked_unfollowed") {
    return { label: "LINE通知不可", description: "現在はLINEで通知できません", colorPalette: "orange" as const };
  }
  return { label: "LINE未連携", description: "LINEは未連携です", colorPalette: "gray" as const };
}

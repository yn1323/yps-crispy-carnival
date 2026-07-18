import { Badge, HStack } from "@chakra-ui/react";
import type { OrganizationPersonView } from "./types";

type Props = {
  person: OrganizationPersonView;
  compact?: boolean;
};

export function OrganizationUserRoleBadges({ person, compact = false }: Props) {
  const isManager = person.managerRole !== "none";
  const roleLabel = isManager ? "管理者" : "スタッフ";

  return (
    <HStack gap={1.5} wrap="wrap">
      <Badge
        colorPalette={isManager ? "teal" : "gray"}
        variant="subtle"
        borderRadius="full"
        px={2}
        textStyle={compact ? "2xs" : undefined}
      >
        {roleLabel}
      </Badge>
      {person.isLineConnected && (
        <Badge colorPalette="green" variant="subtle" borderRadius="full" px={2} textStyle={compact ? "2xs" : undefined}>
          LINE連携済み
        </Badge>
      )}
    </HStack>
  );
}

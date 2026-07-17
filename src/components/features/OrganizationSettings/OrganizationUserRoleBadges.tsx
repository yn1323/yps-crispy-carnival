import { Badge, HStack } from "@chakra-ui/react";
import type { OrganizationPersonView } from "./types";

type Props = {
  person: OrganizationPersonView;
  compact?: boolean;
};

export function OrganizationUserRoleBadges({ person, compact = false }: Props) {
  return (
    <HStack gap={1.5} wrap="wrap">
      {person.isStaff && (
        <Badge colorPalette="gray" variant="subtle" borderRadius="full" px={2} textStyle={compact ? "2xs" : undefined}>
          スタッフ
        </Badge>
      )}
      {person.managerRole === "active" && (
        <Badge colorPalette="teal" variant="subtle" borderRadius="full" px={2} textStyle={compact ? "2xs" : undefined}>
          管理者
        </Badge>
      )}
      {person.managerRole === "readOnly" && (
        <Badge
          colorPalette="orange"
          variant="subtle"
          borderRadius="full"
          px={2}
          textStyle={compact ? "2xs" : undefined}
        >
          閲覧のみ管理者
        </Badge>
      )}
    </HStack>
  );
}

import { Flex, HStack, Text } from "@chakra-ui/react";
import { LuStore } from "react-icons/lu";
import { OrganizationUserRoleBadges } from "./OrganizationUserRoleBadges";
import { SettingsDrilldownRow } from "./SettingsDrilldownRow";
import type { OrganizationPersonView } from "./types";

type Props = {
  person: OrganizationPersonView;
  onOpenUser: () => void;
};

export function OrganizationUserRow({ person, onOpenUser }: Props) {
  const initial = person.name.trim().charAt(0) || "?";
  const isManager = person.managerRole !== "none";
  const roleLabel = isManager ? "管理者" : "スタッフ";
  const shopNames = person.shopNames.length > 0 ? person.shopNames.join("、") : "なし";

  return (
    <SettingsDrilldownRow
      id={`settings-user-${person.id}`}
      ariaLabel={`${person.name}のユーザー詳細を開く`}
      title={person.name}
      highlighted={isManager}
      onClick={onOpenUser}
      leading={
        <Flex
          boxSize="40px"
          borderRadius="full"
          bg={isManager ? "teal.500" : "teal.50"}
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
      badges={<OrganizationUserRoleBadges person={person} compact />}
      secondary={
        <HStack display={{ base: "none", md: "flex" }} gap={1.5} color="fg.muted" minW={0}>
          <LuStore aria-hidden />
          <Text fontSize="xs" truncate>
            {shopNames}
          </Text>
        </HStack>
      }
      accessibleDescription={
        <>
          {roleLabel}。{person.isLineConnected ? "LINE連携済み。" : ""}所属店舗: {shopNames}。
        </>
      }
    />
  );
}

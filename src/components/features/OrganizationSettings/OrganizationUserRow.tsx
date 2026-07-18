import { Flex, HStack, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import { LuChevronRight, LuStore } from "react-icons/lu";
import { OrganizationUserRoleBadges } from "./OrganizationUserRoleBadges";
import type { OrganizationPersonView } from "./types";

type Props = {
  person: OrganizationPersonView;
  onOpenDetail: () => void;
};

export function OrganizationUserRow({ person, onOpenDetail }: Props) {
  const initial = person.name.trim().charAt(0) || "?";
  const isManager = person.managerRole !== "none";
  const descriptionId = `organization-user-${person.id}-summary`;
  const roleLabel = isManager ? "管理者" : "スタッフ";
  const shopNames = person.shopNames.length > 0 ? person.shopNames.join("、") : "なし";

  return (
    <HStack
      as="button"
      aria-label={`${person.name}のユーザー詳細を開く`}
      aria-describedby={descriptionId}
      gap={3}
      px={{ base: 3, md: 4 }}
      py={3.5}
      align="center"
      w="full"
      textAlign="left"
      bg={isManager ? "teal.50/40" : "transparent"}
      borderWidth={0}
      cursor="pointer"
      transition="background-color 150ms ease"
      _hover={{ bg: isManager ? "teal.50" : "blackAlpha.50" }}
      _focusVisible={{
        outlineWidth: "2px",
        outlineStyle: "solid",
        outlineColor: "teal.500",
        outlineOffset: "-2px",
      }}
      onClick={onOpenDetail}
    >
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

      <Stack gap={1} flex={1} minW={0}>
        <HStack gap={2} align="center" wrap="wrap">
          <Text fontWeight="semibold" color="gray.900" truncate>
            {person.name}
          </Text>
          <OrganizationUserRoleBadges person={person} compact />
        </HStack>

        <HStack gap={1.5} color="fg.muted" minW={0}>
          <LuStore aria-hidden />
          <Text fontSize="xs" truncate>
            {person.shopNames.length > 0 ? person.shopNames.join("、") : "なし"}
          </Text>
        </HStack>
      </Stack>

      <Flex color="fg.muted" fontSize="lg" flexShrink={0} aria-hidden>
        <LuChevronRight />
      </Flex>
      <VisuallyHidden id={descriptionId}>
        {roleLabel}。{person.isLineConnected ? "LINE連携済み。" : ""}所属店舗: {shopNames}。
      </VisuallyHidden>
    </HStack>
  );
}

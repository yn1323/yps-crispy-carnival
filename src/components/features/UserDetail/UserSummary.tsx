import { Badge, Box, Flex, HStack, Stack, Text } from "@chakra-ui/react";
import type { UserDetailData } from "./types";

type Props = {
  data: UserDetailData;
};

export function UserSummary({ data }: Props) {
  const initial = data.person.name.trim().charAt(0) || "?";

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
              <Text fontSize={{ base: "lg", lg: "xl" }} fontWeight="semibold" color="gray.900" truncate>
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
              {data.managerInvitationState.kind !== "hidden" &&
                data.managerRole === "none" &&
                data.hasManagerInvitation && (
                  <Badge colorPalette="orange" variant="subtle" borderRadius="full" px={2.5}>
                    管理者招待中
                  </Badge>
                )}
            </HStack>
            <Text fontSize="sm" color="fg.muted" truncate>
              {data.person.email || "メールアドレス未登録"}
            </Text>
          </Stack>
        </HStack>
      </Flex>
    </Box>
  );
}

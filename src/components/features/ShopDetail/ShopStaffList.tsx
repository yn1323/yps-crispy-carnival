import { Accordion, Flex, HStack, Stack, Text } from "@chakra-ui/react";
import { OrganizationPersonRow } from "@/src/components/shared/OrganizationPersonRow";
import type { ShopDetailPerson } from "./types";

type Props = {
  staffs: ShopDetailPerson[];
  onOpenUser: (personId: string) => void;
};

export function ShopStaffList({ staffs, onOpenUser }: Props) {
  return (
    <Stack as="section" gap={3} aria-labelledby="shop-detail-staff-list-heading">
      <Text
        id="shop-detail-staff-list-heading"
        as="h2"
        fontSize={{ base: "lg", lg: "xl" }}
        lineHeight={{ base: "1.75rem", lg: "1.875rem" }}
        fontWeight="bold"
        color="gray.900"
      >
        スタッフ
      </Text>

      <Accordion.Root collapsible variant="plain">
        <Accordion.Item
          value="staff-list"
          borderWidth="1px"
          borderColor="blackAlpha.100"
          borderRadius="xl"
          bg="white"
          overflow="hidden"
        >
          <Accordion.ItemTrigger
            px={{ base: 4, md: 5 }}
            py={3}
            minH="48px"
            cursor="pointer"
            textAlign="left"
            _hover={{ bg: "teal.50" }}
          >
            <Flex flex={1} align="center" justify="space-between" gap={3} minW={0}>
              <HStack gap={{ base: 4, md: 8 }} minW={0}>
                <Text as="span" fontSize="sm" fontWeight="semibold" color="gray.700">
                  スタッフ数
                </Text>
                <Text as="span" fontSize="sm" color="gray.900">
                  {staffs.length}名
                </Text>
              </HStack>
              <HStack gap={1} color="teal.700" flexShrink={0}>
                <Text as="span" fontSize="sm" fontWeight="semibold">
                  スタッフ一覧を見る
                </Text>
                <Accordion.ItemIndicator />
              </HStack>
            </Flex>
          </Accordion.ItemTrigger>
          <Accordion.ItemContent borderTopWidth="1px" borderTopColor="blackAlpha.100">
            <Accordion.ItemBody p={0}>
              {staffs.length === 0 ? (
                <Flex justify="center" px={4} py={5}>
                  <Text fontSize="sm" color="fg.muted">
                    この店舗に所属するスタッフはいません。
                  </Text>
                </Flex>
              ) : (
                <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
                  {staffs.map((person) => (
                    <OrganizationPersonRow
                      key={person.id}
                      person={person}
                      idPrefix="shop-detail-user"
                      showLineConnection={false}
                      showShopNames={false}
                      onOpen={() => onOpenUser(person.id)}
                    />
                  ))}
                </Stack>
              )}
            </Accordion.ItemBody>
          </Accordion.ItemContent>
        </Accordion.Item>
      </Accordion.Root>
    </Stack>
  );
}

import { Box, Stack, Text } from "@chakra-ui/react";
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
        スタッフ一覧
      </Text>

      {staffs.length === 0 ? (
        <Box borderWidth="1px" borderStyle="dashed" borderRadius="xl" bg="white" p={5} textAlign="center">
          <Text color="fg.muted">この店舗に所属するスタッフはいません。</Text>
        </Box>
      ) : (
        <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
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
        </Box>
      )}
    </Stack>
  );
}

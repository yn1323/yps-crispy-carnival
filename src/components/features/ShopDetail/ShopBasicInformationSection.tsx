import { Box, Flex, Grid, Stack, Text } from "@chakra-ui/react";
import { LuPencil } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { getShopBasicInformationRows } from "./script";
import type { ShopDetailData } from "./types";

type Props = {
  shop: ShopDetailData;
  onEdit: () => void;
};

export function ShopBasicInformationSection({ shop, onEdit }: Props) {
  const rows = getShopBasicInformationRows(shop);

  return (
    <Stack as="section" gap={3} aria-labelledby="shop-detail-basic-information-heading">
      <Flex align="center" justify="space-between" gap={3}>
        <Text
          id="shop-detail-basic-information-heading"
          as="h2"
          fontSize={{ base: "lg", lg: "xl" }}
          lineHeight={{ base: "1.75rem", lg: "1.875rem" }}
          fontWeight="bold"
          color="gray.900"
        >
          基本情報
        </Text>
        <Button
          type="button"
          variant="ghost"
          colorPalette="teal"
          size="sm"
          gap={1.5}
          fontWeight="semibold"
          flexShrink={0}
          disabled={!shop.canUpdateSettings}
          onClick={onEdit}
        >
          <LuPencil aria-hidden />
          編集する
        </Button>
      </Flex>
      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
          {rows.map((row) => (
            <Grid
              key={row.label}
              templateColumns={{ base: "minmax(0, 7rem) minmax(0, 1fr)", md: "200px minmax(0, 1fr)" }}
              gap={{ base: 3, md: 5 }}
              alignItems="start"
              px={{ base: 4, md: 5 }}
              py={{ base: 3.5, md: 4 }}
            >
              <Text fontSize="sm" fontWeight="semibold" color="gray.700">
                {row.label}
              </Text>
              <Text fontSize="sm" color="gray.900" lineHeight="tall" overflowWrap="anywhere">
                {row.value}
              </Text>
            </Grid>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}

import { Box, Flex, Stack, Text } from "@chakra-ui/react";
import { LuSlidersHorizontal } from "react-icons/lu";
import { DrilldownRow } from "@/src/components/ui/DrilldownRow";

type Props = {
  onOpen: () => void;
};

/** 「シフト作成の設定」ページへ進む導線。設定の中身はこの画面に持たない。 */
export function ShopShiftSetupSection({ onOpen }: Props) {
  return (
    <Stack as="section" gap={3} aria-labelledby="shop-detail-shift-setup-heading">
      <Text
        id="shop-detail-shift-setup-heading"
        as="h2"
        fontSize={{ base: "lg", lg: "xl" }}
        lineHeight={{ base: "1.75rem", lg: "1.875rem" }}
        fontWeight="bold"
        color="gray.900"
      >
        シフト作成
      </Text>
      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        <DrilldownRow
          ariaLabel="シフト作成の設定を開く"
          title="シフト作成の設定"
          secondary={
            <Text fontSize="sm" color="fg.muted" lineHeight="short">
              ポジション、必要人数、休憩の決まり、スタッフの条件
            </Text>
          }
          leading={
            <Flex
              boxSize="40px"
              borderRadius="lg"
              bg="teal.50"
              color="teal.700"
              align="center"
              justify="center"
              flexShrink={0}
            >
              <LuSlidersHorizontal aria-hidden />
            </Flex>
          }
          onClick={onOpen}
        />
      </Box>
    </Stack>
  );
}

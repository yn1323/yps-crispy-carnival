import { Heading, Stack } from "@chakra-ui/react";
import { ShopDetail } from "@/src/components/features/Shop/ShopDetail";

export const ShopsDetailPage = () => {
  return (
    <Stack gap="6" w="full">
      <Heading size="xl">店舗詳細</Heading>
      <ShopDetail />
    </Stack>
  );
};

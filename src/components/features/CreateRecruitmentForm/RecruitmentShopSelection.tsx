import { Flex, RadioCard, Stack } from "@chakra-ui/react";
import { LuStore } from "react-icons/lu";
import type { CreateRecruitmentSelectableShop } from "./types";

type Props = {
  shops: readonly CreateRecruitmentSelectableShop[];
  selectedShopId?: string;
  onChange: (shopId: string) => void;
};

export function RecruitmentShopSelection({ shops, selectedShopId, onChange }: Props) {
  return (
    <RadioCard.Root
      aria-label="対象店舗"
      value={selectedShopId ?? ""}
      onValueChange={({ value }) => {
        if (value) onChange(value);
      }}
      colorPalette="teal"
    >
      <Stack gap={0} borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" overflow="hidden">
        {shops.map((shop, index) => {
          const isSelected = shop.shopId === selectedShopId;

          return (
            <RadioCard.Item
              key={shop.shopId}
              value={shop.shopId}
              borderWidth={0}
              borderRadius={0}
              borderTopWidth={index === 0 ? 0 : "1px"}
              borderTopColor="blackAlpha.100"
              bg={isSelected ? "teal.600" : "white"}
              color={isSelected ? "white" : "gray.900"}
              cursor="pointer"
              _hover={!isSelected ? { bg: "gray.50" } : undefined}
              _checked={{ bg: "teal.600", color: "white" }}
            >
              <RadioCard.ItemHiddenInput />
              <RadioCard.ItemControl px={{ base: 3, md: 4 }} py={3.5} minH="64px" alignItems="center">
                <RadioCard.ItemIndicator flexShrink={0} />
                <Flex
                  boxSize="40px"
                  borderRadius="lg"
                  bg={isSelected ? "teal.700" : "teal.100"}
                  color={isSelected ? "white" : "teal.700"}
                  align="center"
                  justify="center"
                  flexShrink={0}
                  aria-hidden
                >
                  <LuStore size={20} />
                </Flex>
                <RadioCard.ItemContent minW={0}>
                  <RadioCard.ItemText
                    aria-label={`${shop.shopName}を選択`}
                    fontWeight="semibold"
                    color="inherit"
                    overflowWrap="anywhere"
                  >
                    {shop.shopName}
                  </RadioCard.ItemText>
                </RadioCard.ItemContent>
              </RadioCard.ItemControl>
            </RadioCard.Item>
          );
        })}
      </Stack>
    </RadioCard.Root>
  );
}

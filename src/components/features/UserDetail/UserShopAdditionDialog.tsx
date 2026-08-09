import { Box, Flex, Spinner, Stack, Text } from "@chakra-ui/react";
import { LuStore, LuUserPlus } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { Empty } from "@/src/components/ui/Empty";
import type { UserDetailData } from "./types";

type Props = {
  data: UserDetailData;
  isOpen: boolean;
  addingShopId: Id<"shops"> | null;
  isAdding: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  onAddShop: (shopId: Id<"shops">) => void | Promise<void>;
};

export function UserShopAdditionDialog({
  data,
  isOpen,
  addingShopId,
  isAdding,
  onOpenChange,
  onClose,
  onAddShop,
}: Props) {
  const membershipShopIds = new Set(data.memberships.map((membership) => membership.shopId));
  const candidates = data.shops.filter((shop) => shop.shopStatus === "active" && !membershipShopIds.has(shop.shopId));

  return (
    <Dialog
      title="店舗を追加"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={onClose}
      onBackGuardRemoved={onClose}
      hideFooter
      maxW={{ base: "100vw", lg: "640px" }}
      maxH={{ base: "100dvh", lg: "86dvh" }}
      contentProps={{
        w: "100%",
        h: { base: "100dvh", lg: "auto" },
        my: { base: 0, lg: "auto" },
        borderRadius: { base: 0, lg: "l3" },
      }}
      bodyProps={{ px: { base: 4, lg: 6 }, pt: 2, pb: { base: 6, lg: 6 } }}
    >
      {candidates.length === 0 ? (
        <Empty
          icon={LuStore}
          title="追加できる店舗はありません"
          description="このユーザーは、追加できるすべての店舗に所属しています。"
          tone="brand"
          variant="section"
          minH="240px"
        />
      ) : (
        <Stack gap={4}>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            追加する店舗を選んでください。
          </Text>
          <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
            <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
              {candidates.map((shop) => {
                const isCurrent = shop.shopId === addingShopId;
                return (
                  <Button
                    key={shop.shopId}
                    id={`user-shop-candidate-${shop.shopId}`}
                    variant="plain"
                    type="button"
                    aria-label={isCurrent ? `${shop.shopName}に追加中` : `${shop.shopName}に追加`}
                    aria-busy={isCurrent || undefined}
                    gap={3}
                    px={{ base: 3, lg: 4 }}
                    py={3.5}
                    alignItems="center"
                    w="full"
                    minH="68px"
                    h="auto"
                    justifyContent="flex-start"
                    textAlign="left"
                    whiteSpace="normal"
                    borderWidth={0}
                    borderRadius={0}
                    cursor={!data.canWrite || isAdding ? "not-allowed" : "pointer"}
                    opacity={isAdding && !isCurrent ? 0.6 : 1}
                    transition="background-color 150ms ease, opacity 150ms ease"
                    _hover={!data.canWrite || isAdding ? undefined : { bg: "teal.50" }}
                    _focusVisible={{
                      outlineWidth: "2px",
                      outlineStyle: "solid",
                      outlineColor: "teal.500",
                      outlineOffset: "-2px",
                    }}
                    disabled={!data.canWrite || isAdding}
                    onClick={() => onAddShop(shop.shopId)}
                  >
                    <Flex
                      boxSize="40px"
                      borderRadius="full"
                      bg="teal.50"
                      color="teal.700"
                      align="center"
                      justify="center"
                      fontSize="lg"
                      flexShrink={0}
                      aria-hidden
                    >
                      <LuStore />
                    </Flex>
                    <Text fontWeight="medium" color="gray.900" flex={1} minW={0} truncate>
                      {shop.shopName}
                    </Text>
                    <Flex color="teal.600" fontSize="lg" flexShrink={0} aria-hidden>
                      {isCurrent ? <Spinner size="sm" /> : <LuUserPlus />}
                    </Flex>
                  </Button>
                );
              })}
            </Stack>
          </Box>
        </Stack>
      )}
    </Dialog>
  );
}

import { Badge, Box, Flex, Heading, HStack, Stack, Table, Text } from "@chakra-ui/react";
import { LuArchive, LuPlus, LuRotateCcw, LuStore } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import type { OrganizationShopView } from "./types";

type Props = {
  shops: OrganizationShopView[];
  canAddShop: boolean;
  addShopDisabledReason?: string;
  onAddShop: () => void;
  onArchiveShop: (shopId: string) => void;
  onReactivateShop: (shopId: string) => void;
};

const SHOP_STATUS: Record<
  OrganizationShopView["status"],
  { label: string; colorPalette: "green" | "gray" | "orange" }
> = {
  active: { label: "稼働中", colorPalette: "green" },
  archived: { label: "アーカイブ済み", colorPalette: "gray" },
  planSuspended: { label: "プラン停止中", colorPalette: "orange" },
};

export const ShopsSection = ({
  shops,
  canAddShop,
  addShopDisabledReason,
  onAddShop,
  onArchiveShop,
  onReactivateShop,
}: Props) => (
  <Stack as="section" gap={4} aria-labelledby="organization-shops-heading">
    <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={3} wrap="wrap">
      <Stack gap={1}>
        <HStack gap={2}>
          <LuStore aria-hidden />
          <Heading id="organization-shops-heading" as="h2" fontSize="lg">
            店舗
          </Heading>
        </HStack>
        <Text fontSize="sm" color="fg.muted">
          アーカイブやプラン停止では店舗データを削除せず、履歴を閲覧できます。
        </Text>
      </Stack>
      <Button
        size="sm"
        colorPalette="teal"
        onClick={onAddShop}
        disabled={!canAddShop}
        title={!canAddShop ? addShopDisabledReason : undefined}
        aria-describedby={!canAddShop && addShopDisabledReason ? "organization-shop-add-disabled-reason" : undefined}
        gap={1.5}
      >
        <LuPlus aria-hidden />
        店舗を追加
      </Button>
    </Flex>
    {!canAddShop && addShopDisabledReason && (
      <Stack id="organization-shop-add-disabled-reason" gap={2} alignItems="flex-start">
        <Text fontSize="sm" color="orange.700">
          {addShopDisabledReason}
        </Text>
        {addShopDisabledReason.includes("上限") && (
          <Button asChild size="xs" variant="outline">
            <a href="/contact">利用上限について問い合わせる</a>
          </Button>
        )}
      </Stack>
    )}

    {shops.length === 0 ? (
      <Box borderWidth="1px" borderStyle="dashed" borderRadius="xl" p={6} textAlign="center" color="fg.muted">
        稼働中または保存済みの店舗はありません。
      </Box>
    ) : (
      <>
        <Box display={{ base: "none", md: "block" }} overflowX="auto" borderWidth="1px" borderRadius="xl" bg="white">
          <Table.Root size="sm" minW="680px">
            <Table.Header>
              <Table.Row bg="gray.50">
                <Table.ColumnHeader>店舗</Table.ColumnHeader>
                <Table.ColumnHeader>状態</Table.ColumnHeader>
                <Table.ColumnHeader>Free設定</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">操作</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {shops.map((shop) => (
                <Table.Row key={shop.id}>
                  <Table.Cell fontWeight="semibold">{shop.name}</Table.Cell>
                  <Table.Cell>
                    <ShopStatusBadges shop={shop} />
                  </Table.Cell>
                  <Table.Cell>{shop.isFreeRetainedShop ? "残す店舗" : "—"}</Table.Cell>
                  <Table.Cell textAlign="end">
                    <ShopAction
                      shop={shop}
                      surface="desktop"
                      onArchiveShop={onArchiveShop}
                      onReactivateShop={onReactivateShop}
                    />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>

        <Stack display={{ base: "flex", md: "none" }} gap={3}>
          {shops.map((shop) => (
            <Box key={shop.id} borderWidth="1px" borderRadius="xl" bg="white" p={4}>
              <Stack gap={3}>
                <Flex justify="space-between" gap={3} align="flex-start">
                  <Text fontWeight="bold">{shop.name}</Text>
                  <ShopStatusBadges shop={shop} />
                </Flex>
                <ShopAction
                  shop={shop}
                  surface="mobile"
                  onArchiveShop={onArchiveShop}
                  onReactivateShop={onReactivateShop}
                />
              </Stack>
            </Box>
          ))}
        </Stack>
      </>
    )}
  </Stack>
);

const ShopStatusBadges = ({ shop }: { shop: OrganizationShopView }) => {
  const status = SHOP_STATUS[shop.status];
  return (
    <HStack gap={1.5} wrap="wrap">
      <Badge colorPalette={status.colorPalette} variant="subtle">
        {status.label}
      </Badge>
      {shop.isFreeRetainedShop && (
        <Badge colorPalette="teal" variant="outline">
          Freeで残す店舗
        </Badge>
      )}
    </HStack>
  );
};

const ShopAction = ({
  shop,
  surface,
  onArchiveShop,
  onReactivateShop,
}: {
  shop: OrganizationShopView;
  surface: "desktop" | "mobile";
  onArchiveShop: (shopId: string) => void;
  onReactivateShop: (shopId: string) => void;
}) => {
  const hasDisabledAction =
    (shop.status !== "archived" && !shop.canArchive) || (shop.status !== "active" && !shop.canReactivate);
  const disabledReasonId =
    hasDisabledAction && shop.actionDisabledReason
      ? `organization-shop-${shop.id}-${surface}-action-disabled-reason`
      : undefined;

  const action =
    shop.status === "active" ? (
      <Button
        size="xs"
        variant="ghost"
        onClick={() => onArchiveShop(shop.id)}
        disabled={!shop.canArchive}
        title={!shop.canArchive ? shop.actionDisabledReason : undefined}
        aria-label={`${shop.name}をアーカイブ`}
        aria-describedby={!shop.canArchive ? disabledReasonId : undefined}
        gap={1}
      >
        <LuArchive aria-hidden />
        アーカイブ
      </Button>
    ) : shop.status === "planSuspended" ? (
      <HStack justify="flex-end" gap={1} wrap="wrap">
        <Button
          size="xs"
          variant="ghost"
          onClick={() => onArchiveShop(shop.id)}
          disabled={!shop.canArchive}
          title={!shop.canArchive ? shop.actionDisabledReason : undefined}
          aria-label={`${shop.name}をアーカイブ`}
          aria-describedby={!shop.canArchive ? disabledReasonId : undefined}
          gap={1}
        >
          <LuArchive aria-hidden />
          アーカイブ
        </Button>
        <Button
          size="xs"
          variant="outline"
          onClick={() => onReactivateShop(shop.id)}
          disabled={!shop.canReactivate}
          title={!shop.canReactivate ? shop.actionDisabledReason : undefined}
          aria-label={`${shop.name}を再稼働`}
          aria-describedby={!shop.canReactivate ? disabledReasonId : undefined}
          gap={1}
        >
          <LuRotateCcw aria-hidden />
          再稼働
        </Button>
      </HStack>
    ) : (
      <Button
        size="xs"
        variant="outline"
        onClick={() => onReactivateShop(shop.id)}
        disabled={!shop.canReactivate}
        title={!shop.canReactivate ? shop.actionDisabledReason : undefined}
        aria-label={`${shop.name}を再稼働`}
        aria-describedby={!shop.canReactivate ? disabledReasonId : undefined}
        gap={1}
      >
        <LuRotateCcw aria-hidden />
        再稼働
      </Button>
    );

  return (
    <Stack gap={1.5} align={surface === "desktop" ? "flex-end" : "stretch"}>
      {action}
      {disabledReasonId && shop.actionDisabledReason && (
        <Text
          id={disabledReasonId}
          maxW={surface === "desktop" ? "320px" : undefined}
          fontSize="xs"
          color="orange.700"
          textAlign={surface === "desktop" ? "end" : "start"}
        >
          {shop.actionDisabledReason}
        </Text>
      )}
    </Stack>
  );
};

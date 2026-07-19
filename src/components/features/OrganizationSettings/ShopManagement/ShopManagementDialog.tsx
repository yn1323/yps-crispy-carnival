import { Flex, HStack, Stack, Tabs, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { LuStore } from "react-icons/lu";
import { ShopForm, type ShopFormData } from "@/src/components/features/ShopForm";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { StepperDialog } from "@/src/components/ui/StepperDialog";
import { DeletionActionSection } from "../DeletionActionSection";
import type { ShopManagementDialogState, ShopManagementOperation } from "./types";

const ADD_SHOP_DEFAULT_VALUES: ShopFormData = {
  shopName: "",
  regularClosedDays: [],
  submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
};

type Props = {
  dialog: ShopManagementDialogState | null;
  isRunning: boolean;
  onClose: () => void;
  onSubmit: (operation: ShopManagementOperation) => void | Promise<void>;
};

export function ShopManagementDialog({ dialog, isRunning, onClose, onSubmit }: Props) {
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const confirmDeleteButtonRef = useRef<HTMLButtonElement>(null);
  const dialogKey = dialog && "shop" in dialog ? `${dialog.kind}:${dialog.shop.id}` : (dialog?.kind ?? null);

  useEffect(() => {
    if (dialogKey !== null) setIsDeleteConfirmationOpen(false);
  }, [dialogKey]);

  useEffect(() => {
    if (isDeleteConfirmationOpen) confirmDeleteButtonRef.current?.focus();
  }, [isDeleteConfirmationOpen]);

  if (!dialog) return null;

  if (dialog.kind === "addShop") {
    return (
      <StepperDialog
        title="店舗を追加"
        isOpen
        onOpenChange={({ open }) => {
          if (!open) onClose();
        }}
        onClose={onClose}
      >
        <ShopForm
          defaultValues={ADD_SHOP_DEFAULT_VALUES}
          onSubmit={(data) => onSubmit({ kind: "addShop", data })}
          onCancel={onClose}
          submitLabel="店舗を追加"
        />
      </StepperDialog>
    );
  }

  if (dialog.kind === "shopSettings") {
    return (
      <StepperDialog
        title="店舗設定"
        isOpen
        onOpenChange={({ open }) => {
          if (!open) onClose();
        }}
        onClose={onClose}
      >
        <ShopForm
          key={dialog.shop.id}
          defaultValues={{
            shopName: dialog.shop.name,
            regularClosedDays: dialog.shop.regularClosedDays,
            submissionPattern: dialog.shop.submissionPattern,
          }}
          onSubmit={(data) => onSubmit({ kind: "updateShop", shopId: dialog.shop.id, data })}
          onCancel={onClose}
        />
      </StepperDialog>
    );
  }

  const shop = dialog.shop;
  const deleteDescriptionId = `organization-shop-${shop.id}-delete-description`;
  const deleteConfirmationTitleId = `organization-shop-${shop.id}-delete-confirmation-title`;
  return (
    <Dialog
      title={isDeleteConfirmationOpen ? "店舗を削除" : "店舗詳細"}
      isOpen
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      onClose={onClose}
      hideFooter
      role={isDeleteConfirmationOpen ? "alertdialog" : "dialog"}
      maxW={{ base: "100vw", md: "720px" }}
      maxH={{ base: "100dvh", md: "86dvh" }}
      contentProps={{
        w: "100%",
        h: { base: "100dvh", md: "auto" },
        minH: { base: "100dvh", md: "420px" },
        my: { base: 0, md: "auto" },
        borderRadius: { base: 0, md: "l3" },
      }}
      bodyProps={{ px: { base: 4, md: 6 }, pt: 0, pb: 6 }}
    >
      <Stack gap={5}>
        <HStack gap={3}>
          <Flex boxSize="44px" borderRadius="lg" bg="teal.50" color="teal.700" align="center" justify="center">
            <LuStore aria-hidden />
          </Flex>
          <Text fontSize="lg" fontWeight="bold" color="gray.900">
            {shop.name}
          </Text>
        </HStack>

        <Tabs.Root defaultValue="info" colorPalette="teal" variant="line">
          <Tabs.List borderBottomWidth="1px">
            <Tabs.Trigger value="info">情報</Tabs.Trigger>
            <Tabs.Trigger value="settings">設定</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="info" pt={4}>
            <Stack gap={3}>
              <DetailRow label="所属スタッフ" value={`${shop.staffCount}名`} />
            </Stack>
          </Tabs.Content>
          <Tabs.Content value="settings" pt={4}>
            <DeletionActionSection
              description="この店舗を利用できない状態にします。この操作は元に戻せません。"
              descriptionId={deleteDescriptionId}
              actionLabel="この店舗を削除"
              canDelete={shop.canDelete}
              disabledReason={shop.deleteDisabledReason}
              disabledReasonId={`organization-shop-${shop.id}-delete-disabled-reason`}
              onDelete={() => setIsDeleteConfirmationOpen(true)}
              confirmation={
                isDeleteConfirmationOpen ? (
                  <Stack gap={3} aria-labelledby={deleteConfirmationTitleId} aria-describedby={deleteDescriptionId}>
                    <Text id={deleteConfirmationTitleId} fontSize="sm" fontWeight="semibold">
                      「{shop.name}」を削除しますか？
                    </Text>
                    <Stack gap={1.5} fontSize="sm" color="fg.muted" lineHeight="tall">
                      <Text>
                        この店舗と所属スタッフは利用できなくなり、この店舗の管理権限、LINE連携、提出・閲覧用リンクを停止します。
                      </Text>
                      <Text>
                        店舗名、スタッフの氏名・メールアドレス、過去のシフトなどの履歴は、業務記録として残ります。
                      </Text>
                      <Text>グループのユーザーと、ほかの店舗の管理権限は残ります。</Text>
                    </Stack>
                    <HStack gap={2} justify="flex-end" wrap="wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsDeleteConfirmationOpen(false)}
                        disabled={isRunning}
                      >
                        キャンセル
                      </Button>
                      <Button
                        ref={confirmDeleteButtonRef}
                        colorPalette="red"
                        size="sm"
                        loading={isRunning}
                        onClick={() => onSubmit({ kind: "deleteShop", shopId: shop.id })}
                      >
                        店舗を削除
                      </Button>
                    </HStack>
                  </Stack>
                ) : undefined
              }
            />
          </Tabs.Content>
        </Tabs.Root>
      </Stack>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack
      justify="space-between"
      align="flex-start"
      gap={4}
      py={2}
      borderBottomWidth="1px"
      borderColor="blackAlpha.100"
    >
      <Text fontSize="sm" color="fg.muted">
        {label}
      </Text>
      <Text fontSize="sm" fontWeight="semibold" textAlign="end">
        {value}
      </Text>
    </HStack>
  );
}

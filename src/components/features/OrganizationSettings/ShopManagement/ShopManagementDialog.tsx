import { Field, Input, NativeSelect, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import type { ShiftSubmissionPattern } from "@/convex/_lib/submissionPattern";
import { SHOP_NAME_MAX_LENGTH } from "@/convex/constants";
import { Dialog } from "@/src/components/ui/Dialog";
import type { ShopManagementDialogState } from "./types";

type Operation =
  | { kind: "addShop"; shopName: string; submissionPattern: ShiftSubmissionPattern }
  | { kind: "archiveShop"; shopId: string }
  | { kind: "reactivateShop"; shopId: string };

type Props = {
  dialog: ShopManagementDialogState | null;
  isRunning: boolean;
  onClose: () => void;
  onSubmit: (operation: Operation) => void;
};

export function ShopManagementDialog({ dialog, isRunning, onClose, onSubmit }: Props) {
  const [shopName, setShopName] = useState("");
  const [submissionKind, setSubmissionKind] = useState<"time" | "dateOnly">("time");
  useEffect(() => {
    if (dialog?.kind !== "addShop") return;
    setShopName("");
    setSubmissionKind("time");
  }, [dialog?.kind]);

  if (!dialog) return null;

  if (dialog.kind === "addShop") {
    const normalizedName = shopName.trim();
    const submissionPattern: ShiftSubmissionPattern =
      submissionKind === "dateOnly" ? { kind: "dateOnly" } : { kind: "time", startTime: "09:00", endTime: "22:00" };
    return (
      <Dialog
        title="店舗を追加"
        isOpen
        onOpenChange={({ open }) => {
          if (!open) onClose();
        }}
        onClose={onClose}
        formId="add-organization-shop-form"
        submitLabel="店舗を追加"
        isLoading={isRunning}
        isSubmitDisabled={!normalizedName}
        maxW={{ base: "calc(100vw - 24px)", md: "520px" }}
      >
        <form
          id="add-organization-shop-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (normalizedName) onSubmit({ kind: "addShop", shopName: normalizedName, submissionPattern });
          }}
        >
          <Stack gap={4}>
            <Field.Root required>
              <Field.Label>店舗名</Field.Label>
              <Input
                value={shopName}
                maxLength={SHOP_NAME_MAX_LENGTH}
                placeholder="例：渋谷店"
                onChange={(event) => setShopName(event.currentTarget.value)}
              />
            </Field.Root>
            <Field.Root required>
              <Field.Label>希望シフトの提出方法</Field.Label>
              <NativeSelect.Root>
                <NativeSelect.Field
                  value={submissionKind}
                  onChange={(event) => setSubmissionKind(event.currentTarget.value as "time" | "dateOnly")}
                >
                  <option value="time">時間を指定</option>
                  <option value="dateOnly">出勤日のみ</option>
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
              <Field.HelperText>時間指定は9:00〜22:00で作成します。追加後に店舗設定から変更できます。</Field.HelperText>
            </Field.Root>
          </Stack>
        </form>
      </Dialog>
    );
  }

  const isArchive = dialog.kind === "archiveShop";
  return (
    <Dialog
      title={isArchive ? "店舗をアーカイブ" : "店舗を再稼働"}
      isOpen
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      onClose={onClose}
      onSubmit={() => onSubmit({ kind: dialog.kind, shopId: dialog.shop.id })}
      submitLabel={isArchive ? "アーカイブする" : "再稼働する"}
      isLoading={isRunning}
      role="alertdialog"
      maxW={{ base: "calc(100vw - 24px)", md: "520px" }}
    >
      <Stack gap={3}>
        <Text fontWeight="bold">{dialog.shop.name}</Text>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          {isArchive
            ? "店舗データと過去のシフトは削除しません。アーカイブ後も履歴を閲覧できます。"
            : "現在のプラン上限を確認し、この店舗でシフト運用を再開します。"}
        </Text>
      </Stack>
    </Dialog>
  );
}

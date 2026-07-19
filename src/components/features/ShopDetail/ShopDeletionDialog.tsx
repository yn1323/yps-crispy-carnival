import { Stack, Text } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import type { ShopDetailData } from "./types";

type Props = {
  shop: ShopDetailData;
  isOpen: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onDelete: () => Promise<boolean>;
};

export function ShopDeletionDialog({ shop, isOpen, isDeleting, onClose, onDelete }: Props) {
  if (!isOpen) return null;

  return (
    <Dialog
      title="店舗を削除"
      isOpen
      role="alertdialog"
      submitColorPalette="red"
      onOpenChange={({ open }) => {
        if (!open && !isDeleting) onClose();
      }}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            キャンセル
          </Button>
          <Button
            colorPalette="red"
            loading={isDeleting}
            onClick={async () => {
              const deleted = await onDelete();
              if (deleted) onClose();
            }}
          >
            店舗を削除
          </Button>
        </>
      }
      maxW={{ base: "calc(100vw - 24px)", md: "560px" }}
    >
      <Stack gap={3}>
        <Text fontWeight="semibold">「{shop.name}」を削除しますか？</Text>
        <Stack gap={1.5} fontSize="sm" color="fg.muted" lineHeight="tall">
          <Text>
            この店舗と所属スタッフは利用できなくなり、この店舗の管理権限、LINE連携、提出・閲覧用リンクを停止します。
          </Text>
          <Text>店舗名、スタッフの氏名・メールアドレス、過去のシフトなどの履歴は、業務記録として残ります。</Text>
          <Text>グループのユーザーと、ほかの店舗の管理権限は残ります。</Text>
        </Stack>
      </Stack>
    </Dialog>
  );
}

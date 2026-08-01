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
      title={`${shop.name}を削除しますか？`}
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
      <Stack gap={3} fontSize="sm" color="fg.muted" lineHeight="tall">
        <Stack gap={1}>
          <Text>削除すると、この店舗と所属スタッフは利用できなくなります。</Text>
          <Text>この店舗の管理権限、LINE連携、シフトの提出・閲覧用リンクも停止します。</Text>
        </Stack>
        <Text color="red.700" fontWeight="semibold">
          この操作は元に戻せません。
        </Text>
      </Stack>
    </Dialog>
  );
}

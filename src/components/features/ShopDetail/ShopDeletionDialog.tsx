import { Stack, Text } from "@chakra-ui/react";
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
      onSubmit={async () => {
        const deleted = await onDelete();
        if (deleted) onClose();
      }}
      submitLabel="店舗を削除"
      isLoading={isDeleting}
      maxW={{ base: "calc(100vw - 24px)", md: "560px" }}
    >
      <Stack gap={3} fontSize="sm" color="fg.muted" lineHeight="tall">
        <Stack gap={1}>
          <Text>削除すると、この店舗は利用できなくなり、所属スタッフもアクセスできなくなります。</Text>
          <Text>この店舗の管理権限と、シフトの提出・閲覧用リンクも無効になります。</Text>
          <Text>LINE連携は組織に残り、ほかの所属店舗や今後追加する所属店舗で共通して使われます。</Text>
        </Stack>
        <Text color="red.700" fontWeight="semibold">
          この操作は元に戻せません。
        </Text>
      </Stack>
    </Dialog>
  );
}

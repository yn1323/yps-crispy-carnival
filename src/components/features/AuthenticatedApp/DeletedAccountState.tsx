import { Stack } from "@chakra-ui/react";
import { SignOutButton } from "@clerk/react";
import { LuUserRoundX } from "react-icons/lu";
import { AccountDeletion } from "@/src/components/features/AccountDeletion";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";

type Props = {
  accountDeletionRequested?: boolean;
};

export function DeletedAccountState({ accountDeletionRequested = false }: Props) {
  return (
    <Empty
      icon={LuUserRoundX}
      title={accountDeletionRequested ? "アカウントの削除を受け付けました" : "シフトリの利用は終了しています"}
      description={
        accountDeletionRequested
          ? "このアカウントでは、シフトリを利用できなくなりました。\n組織・店舗の利用終了が含まれる場合は、その処理後にログイン用アカウントを削除します。\n完了まで時間がかかる場合がありますが、このページを閉じても処理は続きます。"
          : "このアカウントではシフトリを利用できません。\nログイン用アカウントは残っています。"
      }
      secondaryDescription={
        accountDeletionRequested
          ? "氏名、メールアドレス、店舗名、過去のシフト・同意・請求・操作記録などは、法令または契約上必要な業務記録として残る場合があります。\n同じメールアドレスで登録し直しても、新しいアカウントには自動では引き継がれません。"
          : "氏名、メールアドレス、店舗名、過去のシフト・同意・請求・操作記録などは、法令または契約上必要な業務記録として残る場合があります。\nログイン用アカウントも削除する場合は、下のボタンから手続きしてください。"
      }
      tone="warning"
      minH="100dvh"
      action={
        <Stack align="center" gap={3}>
          <SignOutButton>
            <Button colorPalette="teal">ログアウト</Button>
          </SignOutButton>
          {!accountDeletionRequested ? <AccountDeletion variant="legacy" /> : null}
        </Stack>
      }
    />
  );
}

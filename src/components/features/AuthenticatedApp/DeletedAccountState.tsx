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
          ? "このアカウントでは、シフトリを利用できなくなりました。\nログイン用アカウントの削除は、通常は数分以内に完了します。\nこのページを閉じても処理は続きます。"
          : "このアカウントではシフトリを利用できません。\nログイン用アカウントは残っています。"
      }
      secondaryDescription={
        accountDeletionRequested
          ? "シフトリ内の氏名、メールアドレス、店舗名、過去の利用履歴は、業務記録として残ります。\n同じメールアドレスで登録し直しても、新しいアカウントには自動では引き継がれません。"
          : "シフトリ内の氏名、メールアドレス、店舗名、過去の利用履歴は、業務記録として残ります。\nログイン用アカウントも削除する場合は、下のボタンから手続きしてください。"
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

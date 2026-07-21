import { Stack } from "@chakra-ui/react";
import { SignOutButton } from "@clerk/clerk-react";
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
          ? "このアカウントでは、すでにシフトリを利用できません。ログイン用アカウントの削除は通常、数分以内に完了します。このページを閉じても処理は続きます。"
          : "このアカウントではシフトリを利用できません。ログイン用のアカウントは残っています。"
      }
      secondaryDescription={
        accountDeletionRequested
          ? "シフトリ内の氏名、メールアドレス、店舗名、過去の履歴は業務記録として残ります。同じメールアドレスで登録し直しても、新しいアカウントには自動で引き継がれません。"
          : "シフトリ内の氏名、メールアドレス、店舗名、過去の履歴は業務記録として残ります。ログイン用のアカウントも削除する場合は、下のボタンから手続きしてください。"
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

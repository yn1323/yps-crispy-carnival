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
      title={accountDeletionRequested ? "アカウントの削除を受け付けました" : "アプリ上のアカウントは削除済みです"}
      description={
        accountDeletionRequested
          ? "このログインではシフトリを利用できません。ログイン情報は通常、数分以内に削除されます。このページを閉じても処理は継続します。"
          : "このログインではシフトリのデータを利用できません。Clerkのログイン情報は残っています。"
      }
      secondaryDescription={
        accountDeletionRequested
          ? "シフトリ内の氏名、メールアドレス、店舗名、過去の履歴は業務記録として残ります。登録し直しても、新しいアカウントへ自動で紐付けません。"
          : "シフトリ内の氏名、メールアドレス、店舗名、過去の履歴は業務記録として残ります。ログイン情報も削除する場合は、下からアカウント削除を行ってください。"
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

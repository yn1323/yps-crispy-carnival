import { Stack } from "@chakra-ui/react";
import { SignOutButton } from "@clerk/clerk-react";
import { LuUserRoundX } from "react-icons/lu";
import { AccountDeletion } from "@/src/components/features/AccountDeletion";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { ACCOUNT_DELETION_ENABLED } from "@/src/configs/env";

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
          ? "このログインではシフトリを利用できません。処理の完了まで時間がかかる場合があります。"
          : "このログインではシフトリのデータを利用できません。"
      }
      secondaryDescription={
        accountDeletionRequested ? "同じメールアドレスで登録し直しても、削除前のデータは復元されません。" : undefined
      }
      tone="warning"
      minH="100dvh"
      action={
        <Stack align="center" gap={3}>
          <SignOutButton>
            <Button colorPalette="teal">ログアウト</Button>
          </SignOutButton>
          {!accountDeletionRequested && ACCOUNT_DELETION_ENABLED ? <AccountDeletion variant="legacy" /> : null}
        </Stack>
      }
    />
  );
}

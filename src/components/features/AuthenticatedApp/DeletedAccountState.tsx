import { SignOutButton } from "@clerk/clerk-react";
import { LuUserRoundX } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";

export function DeletedAccountState() {
  return (
    <Empty
      icon={LuUserRoundX}
      title="アプリ上のアカウントは削除済みです"
      description="このログインではシフトリのデータを利用できません。"
      tone="warning"
      minH="100dvh"
      action={
        <SignOutButton>
          <Button colorPalette="teal">ログアウト</Button>
        </SignOutButton>
      }
    />
  );
}

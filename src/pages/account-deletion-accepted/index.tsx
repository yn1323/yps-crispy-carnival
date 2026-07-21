import { Container } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { LuCircleCheck } from "react-icons/lu";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";

export function AccountDeletionAcceptedPage() {
  return (
    <PublicPageLayout showFooter={false} headerProps={{ showLinks: false, showLogin: false }}>
      <Container maxW="720px" px={{ base: 4, md: 6 }}>
        <Empty
          icon={LuCircleCheck}
          iconVariant="circle"
          size="lg"
          title="アカウントの削除を受け付けました"
          description="このアカウントでは、すでにシフトリを利用できません。ログイン用アカウントの削除は通常、数分以内に完了します。このページを閉じても処理は続きます。"
          secondaryDescription="シフトリ内の氏名、メールアドレス、店舗名、過去の履歴は業務記録として残ります。同じメールアドレスで登録し直しても、新しいアカウントには自動で引き継がれません。"
          tone="brand"
          minH={{ base: `calc(100dvh - ${HEADER_HEIGHT.base})`, md: `calc(100dvh - ${HEADER_HEIGHT.md})` }}
          px={{ base: 2, md: 4 }}
          action={
            <Button asChild colorPalette="teal" minW="160px" mt={2}>
              <RouterLink to="/">トップページへ戻る</RouterLink>
            </Button>
          }
        />
      </Container>
    </PublicPageLayout>
  );
}

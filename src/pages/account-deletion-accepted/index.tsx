import { Container } from "@chakra-ui/react";
import { LuCircleCheck } from "react-icons/lu";
import { MeasurementBoundaryLink } from "@/src/components/shared/MeasurementBoundaryLink";
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
          titleAs="h1"
          description={
            "このアカウントでは、シフトリを利用できなくなりました。\n組織・店舗の利用終了が含まれる場合は、その処理後にログイン用アカウントを削除します。\n完了まで時間がかかる場合がありますが、このページを閉じても処理は続きます。"
          }
          secondaryDescription={
            "氏名、メールアドレス、店舗名、過去のシフト・同意・請求・操作記録などは、法令または契約上必要な業務記録として残る場合があります。\n同じメールアドレスで登録し直しても、新しいアカウントには自動では引き継がれません。"
          }
          tone="brand"
          minH={{ base: `calc(100dvh - ${HEADER_HEIGHT.base})`, md: `calc(100dvh - ${HEADER_HEIGHT.md})` }}
          px={{ base: 2, md: 4 }}
          action={
            <Button asChild colorPalette="teal" minW="160px" mt={2}>
              <MeasurementBoundaryLink href="/">トップページへ戻る</MeasurementBoundaryLink>
            </Button>
          }
        />
      </Container>
    </PublicPageLayout>
  );
}

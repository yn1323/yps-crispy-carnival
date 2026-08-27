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
          title="アカウントを削除しました"
          titleAs="h1"
          description="シフトリをご利用いただきありがとうございました。"
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

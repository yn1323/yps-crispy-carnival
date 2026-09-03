import { Container } from "@chakra-ui/react";
import { LuCircleCheck } from "react-icons/lu";
import { MeasurementLink } from "@/src/components/shared/MeasurementLink";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";

export function AccountDeletionAcceptedPage() {
  return (
    <PublicPageLayout showFooter={false}>
      <Container maxW="720px" px={{ base: 4, md: 6 }}>
        <Empty
          icon={LuCircleCheck}
          iconVariant="circle"
          size="lg"
          title="アカウントの削除を受け付けました"
          titleAs="h1"
          description="シフトリをご利用いただきありがとうございました。"
          tone="brand"
          minH={{ base: `calc(100dvh - ${HEADER_HEIGHT.base})`, md: `calc(100dvh - ${HEADER_HEIGHT.md})` }}
          px={{ base: 2, md: 4 }}
          action={
            <Button asChild colorPalette="teal" minW="160px" mt={2}>
              <MeasurementLink href="/">トップページへ戻る</MeasurementLink>
            </Button>
          }
        />
      </Container>
    </PublicPageLayout>
  );
}

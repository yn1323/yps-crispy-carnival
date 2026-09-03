import { Container } from "@chakra-ui/react";
import { LuFileQuestion } from "react-icons/lu";
import { MeasurementLink } from "@/src/components/shared/MeasurementLink";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";

export function NotFoundPage() {
  return (
    <PublicPageLayout showFooter={false}>
      <Container data-static-not-found maxW="720px" px={{ base: 4, md: 6 }}>
        <Empty
          icon={LuFileQuestion}
          iconVariant="circle"
          size="lg"
          title="ページが見つかりません"
          titleAs="h1"
          description={
            "URLが正しいか確認してください。\n見つからない場合は、トップページから目的のページをお探しください。"
          }
          tone="neutral"
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

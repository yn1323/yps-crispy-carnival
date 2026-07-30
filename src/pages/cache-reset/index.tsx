import { Container } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { LuRefreshCw } from "react-icons/lu";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";

export function CacheResetPage() {
  return (
    <PublicPageLayout showFooter={false} headerProps={{ showLinks: false, showLogin: false }}>
      <Container maxW="720px" px={{ base: 4, md: 6 }}>
        <Empty
          icon={LuRefreshCw}
          iconVariant="circle"
          size="lg"
          title="ページ情報を更新しました"
          titleAs="h1"
          description="この端末に残っていた古いページ情報を消去しました。トップページへ戻り、もう一度お試しください。"
          secondaryDescription="同じエラーが続く場合は、Chromeの閲覧履歴からキャッシュされた画像とファイルを削除してください。"
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

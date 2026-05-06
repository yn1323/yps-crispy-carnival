import { Alert, Box, Heading, Link, List, Text, VStack } from "@chakra-ui/react";
import { createFileRoute, Link as RouterLink } from "@tanstack/react-router";
import { DemoShiftBoardPage } from "@/src/components/features/ShiftBoard/DemoShiftBoardPage";
import { buildLinks, buildMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/_unregistered/demo/shiftboard")({
  head: () => ({
    // 採用案: 登録なしで試せる無料デモ｜店長視点でシフト管理を体験
    //   狙い: 「シフト管理 デモ」「シフト管理 試す」「シフト管理 登録なし」
    // 候補A: 無料デモ｜店長視点で操作できるシフト管理サンドボックス（伝わりにくい）
    // 候補B: 資料請求なしで触れる｜飲食店向けシフト管理シフトリのデモ（差別化明確だが検索数小）
    links: buildLinks({ canonical: "/demo/shiftboard" }),
    meta: buildMeta({
      title: "登録なしで試せる無料デモ｜店長視点でシフト管理を体験",
      description:
        "シフトリの店長画面を会員登録なしで試せる無料デモです。希望の集約から確定通知までブラウザで2分で体験できます。資料請求も商談も不要、すぐ触れます。",
      canonical: "/demo/shiftboard",
    }),
  }),
  component: DemoShiftBoardRoute,
});

function DemoShiftBoardRoute() {
  return (
    <>
      <Box display={{ base: "none", lg: "block" }} h="100dvh">
        <DemoShiftBoardPage />
      </Box>
      <Box display={{ base: "block", lg: "none" }} px={6} py={10} maxW="640px" mx="auto">
        <VStack align="stretch" gap={6}>
          <Heading as="h1" size="xl">
            シフトリの無料デモ
          </Heading>

          <Alert.Root status="warning" borderRadius="md">
            <Alert.Indicator />
            <Box>
              <Alert.Title>このデモはPCで操作できます</Alert.Title>
              <Alert.Description fontSize="sm" mt={1}>
                スマホでは閲覧のみで、ガントチャートの操作はできません。PCのブラウザで開いてご確認ください。
              </Alert.Description>
            </Box>
          </Alert.Root>

          <Text color="fg.muted" lineHeight={1.7}>
            シフトリは、少人数のお店のシフト管理をラクにする無料ツールです。このデモでは、店長の操作画面を会員登録なしで試せます。
          </Text>

          <Box>
            <Heading as="h2" size="md" mb={3}>
              シフトリでできること
            </Heading>
            <List.Root gap={2} color="fg.muted">
              <List.Item>スタッフへのシフト希望募集をLINEやメールで完結</List.Item>
              <List.Item>スタッフはアプリのインストールもアカウント登録も不要</List.Item>
              <List.Item>集まった希望をガントチャートで一覧確認・調整</List.Item>
              <List.Item>確定したシフトをワンクリックで全員に通知</List.Item>
              <List.Item>過去のシフトはすべて保存、いつでも参照可能</List.Item>
            </List.Root>
          </Box>

          <Box>
            <Heading as="h2" size="md" mb={3}>
              どんなお店向け？
            </Heading>
            <Text color="fg.muted" lineHeight={1.7}>
              2人から20人くらいの少人数のお店を想定しています。飲食店、カフェ、美容室、小売店、クリニックなど、シフトづくりが必要なお店ならお使いいただけます。
            </Text>
          </Box>

          <Link asChild color="teal.600" fontWeight="bold" _hover={{ textDecoration: "none", opacity: 0.8 }}>
            <RouterLink to="/">← トップページに戻る</RouterLink>
          </Link>
        </VStack>
      </Box>
    </>
  );
}

import { Alert, Box, Heading, Link, List, Text, VStack } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { DemoShiftBoardPage } from "@/src/components/features/Demo";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";

export function DemoShiftBoardRoutePage() {
  return (
    <PublicPageLayout minH="100dvh" showFooter={false} headerProps={{ showLinks: false, showLogin: false }}>
      <Box h={{ base: "auto", lg: `calc(100dvh - ${HEADER_HEIGHT.md})` }} minH={{ lg: "560px" }}>
        <DemoShiftBoardPage
          headerStart={<TopLink />}
          heading={
            <Heading
              as="h1"
              fontSize={{ base: "2xl", lg: "sm" }}
              fontWeight={700}
              color="gray.800"
              whiteSpace={{ base: "normal", lg: "nowrap" }}
            >
              勤務時間入力デモ
            </Heading>
          }
          height="100%"
        />
      </Box>

      <Box display={{ base: "block", lg: "none" }} px={6} pb={10} maxW="640px" mx="auto">
        <VStack align="stretch" gap={6}>
          <Alert.Root status="warning" borderRadius="md">
            <Alert.Indicator />
            <Box>
              <Alert.Title>このデモはPCで操作できます</Alert.Title>
              <Alert.Description fontSize="sm" mt={1}>
                スマホでは閲覧のみで、ガントチャートの操作はできません。
                <br />
                PCのブラウザで開いてご確認ください。
              </Alert.Description>
            </Box>
          </Alert.Root>

          <Text color="fg.muted" lineHeight={1.7}>
            シフトリは、希望シフトの回収から確定シフトの共有までをひとつにまとめるシフト管理サービスです。
            <br />
            このデモでは、店長・シフト作成担当者の操作画面を会員登録なしで試せます。
          </Text>

          <Box>
            <Heading as="h2" size="md" mb={3}>
              シフトリでできること
            </Heading>
            <List.Root gap={2} color="fg.muted">
              <List.Item>スタッフへのシフト募集をLINEやメールで完結</List.Item>
              <List.Item>スタッフはアプリのインストールもアカウント登録も不要</List.Item>
              <List.Item>集まった希望をガントチャートで一覧確認・調整</List.Item>
              <List.Item>確定シフトをワンクリックで全員に通知</List.Item>
              <List.Item>過去のシフトはすべて保存、いつでも参照可能</List.Item>
            </List.Root>
          </Box>

          <Box>
            <Heading as="h2" size="md" mb={3}>
              どんな場面で使える？
            </Heading>
            <Text color="fg.muted" lineHeight={1.7}>
              飲食店、カフェ、美容室、小売店、クリニックなど、シフト作成が必要なお店で使えます。
              <br />
              希望回収、調整、確定シフトの共有までの流れを試せます。
            </Text>
          </Box>
        </VStack>
      </Box>
    </PublicPageLayout>
  );
}

const TopLink = () => (
  <Link asChild color="teal.700" textStyle="sm" fontWeight="bold" _hover={{ opacity: 0.8 }}>
    <RouterLink to="/">← TOPへ</RouterLink>
  </Link>
);

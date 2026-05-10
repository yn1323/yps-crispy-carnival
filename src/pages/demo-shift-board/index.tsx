import { Alert, Box, Container, Heading, Link, List, Text, VStack } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { Nav } from "@/src/components/features/LandingPage";
import { DemoShiftBoardPage } from "@/src/components/features/ShiftBoard/DemoShiftBoardPage";

export function DemoShiftBoardRoutePage() {
  return (
    <Box bg="white" minH="100dvh" color="fg">
      <Nav showLinks={false} showLogin={false} compact />

      <Box as="main" pt={12}>
        <Container display={{ base: "block", lg: "none" }} maxW="640px" pb={4}>
          <TopLink />
        </Container>

        <Box display={{ base: "none", lg: "block" }} h="calc(100dvh - 48px)" minH="560px">
          <DemoShiftBoardPage headerStart={<TopLink />} height="100%" />
        </Box>

        <Box display={{ base: "block", lg: "none" }} px={6} pb={10} maxW="640px" mx="auto">
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
          </VStack>
        </Box>
      </Box>
    </Box>
  );
}

const TopLink = () => (
  <Link asChild color="teal.700" textStyle="sm" fontWeight="bold" _hover={{ opacity: 0.8 }}>
    <RouterLink to="/">← TOPへ</RouterLink>
  </Link>
);

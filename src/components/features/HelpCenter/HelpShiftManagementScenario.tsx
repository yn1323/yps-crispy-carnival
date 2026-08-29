import { Box, Container, chakra, Flex, Grid, Heading, HStack, Link, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuArrowLeft, LuArrowRight, LuCheck, LuPlay, LuUsers } from "react-icons/lu";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import { ConfirmationNotificationExample } from "./ConfirmationNotificationExample";
import { HelpAudienceBadge } from "./HelpAudienceBadge";
import { HelpSupport } from "./HelpSupport";
import { SHIFT_MANAGEMENT_SCENARIO } from "./helpScenario";
import type { HelpAudience } from "./helpTasks";

const FLOW_STEPS = [
  { id: "create-recruitment", number: 1, label: "募集開始" },
  { id: "submit-requests", number: 2, label: "提出" },
  { id: "build-and-confirm", number: 3, label: "調整・確定" },
  { id: "check-notification", number: 4, label: "スタッフへ通知" },
] as const;

type ScenarioVideoSource = { src: string; captionsSrc: string } | { src?: never; captionsSrc?: never };

const SCENARIO_VIDEOS = {
  addStaff: {},
  createRecruitment: {},
  submitRequests: {},
  buildAndConfirm: {},
} satisfies Record<string, ScenarioVideoSource>;

export function HelpShiftManagementScenario() {
  return (
    <PublicPageLayout>
      <Box borderBottomWidth="1px" borderColor="gray.200" bg="gray.50/60">
        <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 7, lg: 10 }}>
          <Stack gap={5} maxW="820px">
            <ScenarioBreadcrumbs />
            <Stack gap={3} align="flex-start">
              <HelpAudienceBadge audience={SHIFT_MANAGEMENT_SCENARIO.audience} />
              <Heading
                id="help-scenario-title"
                as="h1"
                color="gray.950"
                fontSize={{ base: "2xl", lg: "3xl" }}
                lineHeight="1.4"
                letterSpacing="0"
                textWrap="balance"
              >
                {SHIFT_MANAGEMENT_SCENARIO.title}
              </Heading>
              <Text color="gray.700" lineHeight="1.8">
                {SHIFT_MANAGEMENT_SCENARIO.description}
              </Text>
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 8, lg: 14 }}>
        <Stack as="article" aria-labelledby="help-scenario-title" maxW="960px" mx="auto" gap={{ base: 10, lg: 14 }}>
          <PreparationSection />
          <ScenarioStepper />
          <Stack gap={0}>
            <ScenarioStep
              id="create-recruitment"
              number={1}
              audience="manager"
              title="募集シフトを作成する"
              description={
                <>
                  募集期間と提出期限を設定します。
                  <br />
                  シフト募集を作成すると、スタッフへの通知処理が始まります。
                </>
              }
            >
              <ScenarioVideo title="募集シフトを作成する" {...SCENARIO_VIDEOS.createRecruitment} />
            </ScenarioStep>
            <ScenarioStep
              id="submit-requests"
              number={2}
              audience="staff"
              title="希望シフトを提出する"
              description="スタッフは、LINEまたはメールに届いたリンクから希望シフトを提出します。"
            >
              <ScenarioVideo title="希望シフトを提出する" {...SCENARIO_VIDEOS.submitRequests} />
            </ScenarioStep>
            <ScenarioStep
              id="build-and-confirm"
              number={3}
              audience="manager"
              title="シフトを調整して確定する"
              description={
                <>
                  提出された希望シフトを見ながら、勤務時間・勤務日を割り当てます。
                  <br />
                  シフトを確定すると、スタッフへの通知処理が始まります。
                </>
              }
            >
              <ScenarioVideo title="シフトを調整して確定する" {...SCENARIO_VIDEOS.buildAndConfirm} />
            </ScenarioStep>
            <ScenarioStep
              id="check-notification"
              number={4}
              audience="staff"
              title="確定したシフトを通知する"
              description="スタッフへは、次のような通知をメールまたはLINEで送ります。"
            >
              <ConfirmationNotificationExample />
            </ScenarioStep>
          </Stack>
          <DetailedHelp />
          <HelpSupport />
        </Stack>
      </Container>
    </PublicPageLayout>
  );
}

function ScenarioBreadcrumbs() {
  return (
    <HStack as="nav" aria-label="パンくず" gap={2} wrap="wrap" color="gray.600" fontSize="sm">
      <Link href="/help" color="teal.700" fontWeight="semibold">
        ヘルプ・使い方
      </Link>
      <Text aria-hidden>/</Text>
      <Text color="gray.700" lineClamp={1}>
        {SHIFT_MANAGEMENT_SCENARIO.title}
      </Text>
    </HStack>
  );
}

function PreparationSection() {
  return (
    <Grid
      as="section"
      id="staff-preparation"
      aria-labelledby="staff-preparation-title"
      templateColumns={{ base: "1fr", lg: "280px minmax(0, 1fr)" }}
      gap={{ base: 6, lg: 8 }}
      p={{ base: 5, md: 7 }}
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="xl"
      bg="teal.50"
      scrollMarginTop="108px"
    >
      <Stack gap={4} align="flex-start">
        <HStack gap={3}>
          <Flex align="center" justify="center" boxSize={10} borderRadius="lg" bg="teal.100">
            <LuUsers aria-hidden color="var(--chakra-colors-teal-800)" />
          </Flex>
          <Text color="teal.800" fontSize="sm" fontWeight="bold">
            はじめる前に
          </Text>
        </HStack>
        <Heading id="staff-preparation-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }}>
          スタッフを追加する
        </Heading>
        <Text color="gray.700" lineHeight="1.8">
          あらかじめシフトを送るスタッフを追加しましょう。
          <br />
          シフト募集開始後に追加した場合でも、シフトを送ることができます。
        </Text>
        <Link
          href="/help/tasks/staff-management#add-staff-methods"
          color="teal.700"
          fontWeight="bold"
          display="inline-flex"
          alignItems="center"
          gap={2}
        >
          スタッフの追加方法を見る
          <LuArrowRight aria-hidden />
        </Link>
      </Stack>
      <ScenarioVideo title="スタッフを追加する" {...SCENARIO_VIDEOS.addStaff} />
    </Grid>
  );
}

function ScenarioStepper() {
  return (
    <Box as="section" aria-labelledby="scenario-flow-title" display={{ base: "none", md: "block" }}>
      <Stack gap={1} mb={6}>
        <Heading id="scenario-flow-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }}>
          シフト回収の流れ
        </Heading>
      </Stack>
      <SimpleGrid as="nav" aria-label="シフト回収の流れ" columns={{ base: 2, md: 4 }} gap={{ base: 3, md: 0 }}>
        {FLOW_STEPS.map((step, index) => (
          <Flex key={step.id} position="relative" justify="center">
            {index < FLOW_STEPS.length - 1 && (
              <Box
                aria-hidden
                display={{ base: "none", md: "block" }}
                position="absolute"
                top="22px"
                insetInlineStart="calc(50% + 26px)"
                insetInlineEnd="calc(-50% + 26px)"
                h="1px"
                bg="gray.300"
              />
            )}
            <Link
              href={`#${step.id}`}
              position="relative"
              zIndex={1}
              display="flex"
              flexDirection="column"
              alignItems="center"
              gap={2}
              w="full"
              minH={16}
              px={2}
              py={1}
              borderRadius="lg"
              color="gray.900"
              textDecoration="none"
              _hover={{ color: "teal.800", bg: "gray.50", textDecoration: "none" }}
              _active={{ bg: "gray.100" }}
              _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "2px" }}
            >
              <Flex
                align="center"
                justify="center"
                boxSize={10}
                borderWidth="2px"
                borderColor="teal.600"
                borderRadius="full"
                bg="white"
                color="teal.800"
                fontWeight="bold"
              >
                {step.number}
              </Flex>
              <Text fontSize="sm" fontWeight="bold" textAlign="center">
                {step.label}
              </Text>
            </Link>
          </Flex>
        ))}
      </SimpleGrid>
    </Box>
  );
}

function ScenarioStep({
  id,
  number,
  audience,
  title,
  description,
  completion,
  children,
}: {
  id: string;
  number: number;
  audience: HelpAudience;
  title: string;
  description: ReactNode;
  completion?: string;
  children: ReactNode;
}) {
  return (
    <Box
      as="section"
      id={id}
      aria-labelledby={`${id}-title`}
      py={{ base: 8, lg: 10 }}
      borderTopWidth="1px"
      borderColor="gray.200"
      scrollMarginTop="108px"
    >
      <Grid templateColumns={{ base: "1fr", lg: "280px minmax(0, 1fr)" }} gap={{ base: 6, lg: 8 }}>
        <Stack gap={3} align="flex-start">
          <HelpAudienceBadge audience={audience} />
          <HStack align="flex-start" gap={3}>
            <Flex
              align="center"
              justify="center"
              boxSize={8}
              flexShrink={0}
              borderRadius="full"
              bg="teal.600"
              color="white"
              fontWeight="bold"
            >
              {number}
            </Flex>
            <Heading id={`${id}-title`} as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }} lineHeight="1.5">
              {title}
            </Heading>
          </HStack>
          <Text color="gray.700" lineHeight="1.8">
            {description}
          </Text>
        </Stack>
        <Box minW={0}>{children}</Box>
      </Grid>
      {completion && (
        <HStack mt={5} gap={3} align="flex-start">
          <Flex align="center" justify="center" boxSize={6} flexShrink={0} borderRadius="full" bg="teal.600">
            <LuCheck aria-hidden color="white" />
          </Flex>
          <Text color="gray.700" fontSize="sm" lineHeight="1.7">
            完了：{completion}
          </Text>
        </HStack>
      )}
    </Box>
  );
}

function ScenarioVideo({ title, ...video }: { title: string } & ScenarioVideoSource) {
  return (
    <Box aspectRatio="16 / 9" overflow="hidden" borderWidth="1px" borderColor="gray.200" borderRadius="lg" bg="gray.50">
      {video.src ? (
        <chakra.video
          src={video.src}
          controls
          playsInline
          preload="none"
          aria-label={`${title}の動画`}
          w="full"
          h="full"
          bg="black"
        >
          <track kind="captions" src={video.captionsSrc} srcLang="ja" label="日本語" default />
          お使いのブラウザでは動画を再生できません。
        </chakra.video>
      ) : (
        <Flex w="full" h="full" align="center" justify="center">
          <Stack align="center" gap={3} color="gray.600">
            <Flex align="center" justify="center" boxSize={12} borderRadius="full" bg="gray.200">
              <LuPlay aria-hidden color="var(--chakra-colors-gray-700)" />
            </Flex>
            <Text fontSize="sm" fontWeight="semibold">
              動画は準備中
            </Text>
          </Stack>
        </Flex>
      )}
    </Box>
  );
}

function DetailedHelp() {
  return (
    <Box as="section" pt={2}>
      <Link href="/help" color="teal.700" fontWeight="bold" display="flex" alignItems="center" gap={2} w="fit-content">
        <LuArrowLeft aria-hidden />
        ヘルプ・使い方TOPに戻る
      </Link>
    </Box>
  );
}

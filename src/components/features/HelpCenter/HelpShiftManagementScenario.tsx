import {
  Box,
  Container,
  chakra,
  Flex,
  Grid,
  Heading,
  HStack,
  Link,
  List,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuArrowLeft, LuArrowRight, LuCheck, LuUsers } from "react-icons/lu";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import addStaffVideoUrl from "./assets/shift-management/add-staff.mp4?url";
import buildAndConfirmShiftVideoUrl from "./assets/shift-management/build-and-confirm-shift.mp4?url";
import createRecruitmentVideoUrl from "./assets/shift-management/create-recruitment.mp4?url";
import submitShiftPreferencesVideoUrl from "./assets/shift-management/submit-shift-preferences.mp4?url";
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

const SCENARIO_VIDEOS = {
  addStaff: addStaffVideoUrl,
  createRecruitment: createRecruitmentVideoUrl,
  submitRequests: submitShiftPreferencesVideoUrl,
  buildAndConfirm: buildAndConfirmShiftVideoUrl,
} satisfies Record<string, string>;

const SCENARIO_VIDEO_STEPS = {
  addStaff: [
    "シフト一覧の下にある「スタッフを追加する」を選択します。",
    "「スタッフを追加」でスタッフ名とメールアドレスを入力します。",
    "「スタッフを登録する」を選択し、スタッフ一覧に追加されたことを確認します。",
  ],
  createRecruitment: [
    "「募集をつくる」を選択し、シフト期間の開始日と終了日をカレンダーで選びます。",
    "必要に応じて定休日を選び、希望シフトの提出期限を設定します。",
    "確認画面で期間・提出期限・通知方法を確認し、「募集をつくる」を選択します。",
  ],
  submitRequests: [
    "LINEまたはメールに届いたリンクを開き、勤務できる日を選択します。",
    "選んだ日ごとに、勤務できる開始時刻と終了時刻を設定します。",
    "利用規約とプライバシーポリシーへの同意を確認し、「希望シフトを提出」を選択します。",
  ],
  buildAndConfirm: [
    "シフト一覧から募集中のシフトを開き、日別画面でスタッフの希望時間を確認します。",
    "勤務枠をドラッグして、スタッフごとの勤務日と勤務時間を割り当てます。",
    "すべての日を調整したら「シフトを確定して通知」を選択します。",
    "確認画面で希望時間外や未提出スタッフへの割り当てを確認し、もう一度「シフトを確定して通知」を選択します。",
  ],
} satisfies Record<keyof typeof SCENARIO_VIDEOS, readonly string[]>;

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
              <ScenarioVideo
                title="募集シフトを作成する"
                src={SCENARIO_VIDEOS.createRecruitment}
                steps={SCENARIO_VIDEO_STEPS.createRecruitment}
              />
            </ScenarioStep>
            <ScenarioStep
              id="submit-requests"
              number={2}
              audience="staff"
              title="希望シフトを提出する"
              description="スタッフは、LINEまたはメールに届いたリンクから希望シフトを提出します。"
            >
              <ScenarioVideo
                title="希望シフトを提出する"
                src={SCENARIO_VIDEOS.submitRequests}
                steps={SCENARIO_VIDEO_STEPS.submitRequests}
              />
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
              <ScenarioVideo
                title="シフトを調整して確定する"
                src={SCENARIO_VIDEOS.buildAndConfirm}
                steps={SCENARIO_VIDEO_STEPS.buildAndConfirm}
              />
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
      <ScenarioVideo title="スタッフを追加する" src={SCENARIO_VIDEOS.addStaff} steps={SCENARIO_VIDEO_STEPS.addStaff} />
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
      <Grid templateColumns={{ base: "1fr", lg: "340px minmax(0, 1fr)" }} gap={{ base: 6, lg: 8 }}>
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

function ScenarioVideo({ title, src, steps }: { title: string; src: string; steps: readonly string[] }) {
  return (
    <Stack gap={4}>
      <Box
        aspectRatio="16 / 9"
        overflow="hidden"
        borderWidth="1px"
        borderColor="gray.200"
        borderRadius="lg"
        bg="gray.50"
      >
        {/* biome-ignore lint/a11y/useMediaCaption: 音声のない操作動画であり、同等の操作手順を直後のテキストで提供する。 */}
        <chakra.video
          src={src}
          controls
          playsInline
          preload="metadata"
          aria-label={`${title}の動画`}
          w="full"
          h="full"
          objectFit="contain"
          bg="black"
        >
          お使いのブラウザでは動画を再生できません。
        </chakra.video>
      </Box>
      <Stack gap={2}>
        <Heading as="h3" color="gray.950" fontSize="md">
          動画と同じ操作手順
        </Heading>
        <List.Root as="ol" aria-label={`${title}の操作手順`} gap={2} ps={5} color="gray.700" fontSize="sm">
          {steps.map((step) => (
            <List.Item key={step} lineHeight="1.8">
              {step}
            </List.Item>
          ))}
        </List.Root>
      </Stack>
    </Stack>
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

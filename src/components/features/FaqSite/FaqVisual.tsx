import { Badge, Box, Flex, Grid, Stack, Text } from "@chakra-ui/react";
import type { FaqVisual as FaqVisualType } from "./faqContent";

type Props = {
  type: FaqVisualType;
};

export function FaqVisual({ type }: Props) {
  if (type === "notification-channel") return <NotificationChannelVisual />;
  if (type === "organization") return <OrganizationVisual />;
  return <DraftResubmissionVisual />;
}

function NotificationChannelVisual() {
  return (
    <Box
      role="img"
      aria-label="LINEで受け取れる場合は通常LINEへ送り、利用できない場合やLINE送信の上限に達した場合はメールへ切り替える流れ"
      mt={5}
      p={{ base: 4, md: 5 }}
      borderWidth="1px"
      borderColor="teal.100"
      borderRadius="lg"
      bg="teal.50/50"
    >
      <Stack gap={3} align="center">
        <DiagramBox title="通知を送る" />
        <DiagramConnector />
        <DiagramBox title="LINEで受け取れる？" tone="question" />
        <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={3} w="full" maxW="520px">
          <Stack gap={2} align="center">
            <Badge colorPalette="green" variant="subtle">
              はい
            </Badge>
            <DiagramBox title="通常はLINEへ送信" detail="送信上限時はメールへ切替" width="full" />
          </Stack>
          <Stack gap={2} align="center">
            <Badge colorPalette="gray" variant="subtle">
              いいえ
            </Badge>
            <DiagramBox title="メールへ送信" width="full" />
          </Stack>
        </Grid>
      </Stack>
    </Box>
  );
}

function OrganizationVisual() {
  return (
    <Box
      role="img"
      aria-label="グループがユーザー、管理者、料金プランをまとめ、その中にシフトを運用する店舗がある構造"
      mt={5}
      p={{ base: 4, md: 5 }}
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      bg="gray.50"
    >
      <Stack gap={3} align="center">
        <DiagramBox title="グループ" detail="ユーザー・管理者・料金プラン" tone="question" />
        <DiagramConnector />
        <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={3} w="full" maxW="520px">
          <DiagramBox title="店舗 A" detail="募集・シフト作成" width="full" />
          <DiagramBox title="店舗 B" detail="募集・シフト作成" width="full" />
        </Grid>
      </Stack>
    </Box>
  );
}

function DraftResubmissionVisual() {
  return (
    <Box
      role="img"
      aria-label="下書き保存後の初回提出は割り当てへ反映されるが、再提出は保存済み割り当てを上書きしない違い"
      mt={5}
      p={{ base: 4, md: 5 }}
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      bg="gray.50"
    >
      <Stack gap={3}>
        <ComparisonRow
          label="下書き時に未提出"
          action="スタッフが初回提出"
          result="希望を割り当てへ反映"
          resultTone="teal"
        />
        <ComparisonRow
          label="下書き時に提出済み"
          action="スタッフが再提出"
          result="保存済みの割り当ては維持"
          resultTone="orange"
        />
      </Stack>
    </Box>
  );
}

function ComparisonRow({
  label,
  action,
  result,
  resultTone,
}: {
  label: string;
  action: string;
  result: string;
  resultTone: "teal" | "orange";
}) {
  return (
    <Grid
      templateColumns={{ base: "1fr", md: "minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr)" }}
      alignItems="center"
      gap={{ base: 1.5, md: 3 }}
    >
      <DiagramBox title={label} width="full" />
      <Text aria-hidden color="gray.400" textAlign="center" transform={{ base: "rotate(90deg)", md: "none" }}>
        →
      </Text>
      <DiagramBox title={action} width="full" tone="question" />
      <Text aria-hidden color="gray.400" textAlign="center" transform={{ base: "rotate(90deg)", md: "none" }}>
        →
      </Text>
      <Box
        px={3}
        py={3}
        borderWidth="1px"
        borderColor={`${resultTone}.200`}
        borderRadius="md"
        bg={`${resultTone}.50`}
        textAlign="center"
      >
        <Text color="gray.900" fontSize="sm" fontWeight="bold" lineHeight="1.6">
          {result}
        </Text>
      </Box>
    </Grid>
  );
}

function DiagramBox({
  title,
  detail,
  tone = "plain",
  width,
}: {
  title: string;
  detail?: string;
  tone?: "plain" | "question";
  width?: string;
}) {
  return (
    <Box
      w={width}
      maxW={width ? undefined : "320px"}
      px={4}
      py={3}
      borderWidth="1px"
      borderColor={tone === "question" ? "teal.300" : "gray.200"}
      borderRadius="md"
      bg="white"
      textAlign="center"
    >
      <Text color="gray.950" fontSize="sm" fontWeight="bold">
        {title}
      </Text>
      {detail && (
        <Text mt={1} color="gray.600" fontSize="xs" lineHeight="1.6">
          {detail}
        </Text>
      )}
    </Box>
  );
}

function DiagramConnector() {
  return (
    <Flex aria-hidden align="center" justify="center" color="gray.400" h={5}>
      ↓
    </Flex>
  );
}

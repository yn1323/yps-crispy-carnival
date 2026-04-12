import { Box, Button, Flex, Heading, Stack, Text } from "@chakra-ui/react";
import { LuArrowRight, LuCalendarPlus, LuChevronDown, LuClipboardList } from "react-icons/lu";
import { Empty } from "@/src/components/ui/Empty";
import { InfoGuide } from "@/src/components/ui/InfoGuide";
import { LoadMoreButton } from "../LoadMoreButton";
import { RecruitmentCard } from "../RecruitmentCard";
import { RecruitmentStatusBadge } from "../RecruitmentStatusBadge";
import type { PaginationStatus, Recruitment } from "../types";

type Props = {
  recruitments: Recruitment[];
  onCreateClick: () => void;
  onOpenShiftBoard: (recruitmentId: string) => void;
  status: PaginationStatus;
  onLoadMore: () => void;
};

export function RecruitmentSection({ recruitments, onCreateClick, onOpenShiftBoard, status, onLoadMore }: Props) {
  return (
    <Stack gap={4}>
      <Flex justify="space-between" align="center">
        <Flex align="center" gap={0.5}>
          <Heading size={{ base: "md", lg: "lg" }}>シフト</Heading>
          <InfoGuide
            title="シフトについて"
            pages={[
              <Stack key="1" gap={3}>
                <Text fontSize="sm">期間を決めてスタッフにシフト希望を集められます</Text>
                <Flex align="center" gap={2}>
                  <Button size="sm" colorPalette="teal" pointerEvents="none">
                    <LuCalendarPlus />
                    シフト希望を集める
                  </Button>
                </Flex>
                <Stack gap={0.5}>
                  <Text fontSize="xs" color="fg.muted">
                    このボタンを押すと 対象期間と締切を設定できます
                  </Text>
                  <Text fontSize="xs" color="fg.muted">
                    作成するとスタッフにメールで通知が届きます
                  </Text>
                </Stack>
              </Stack>,
              <Stack key="2" gap={3}>
                <Text fontSize="sm">カードのステータスで進み具合がわかります</Text>
                <Stack gap={2}>
                  <Flex align="center" gap={2}>
                    <RecruitmentStatusBadge status="collecting" />
                    <Text fontSize="xs" color="fg.muted">
                      スタッフからの希望を受付中
                    </Text>
                  </Flex>
                  <Flex align="center" gap={2}>
                    <RecruitmentStatusBadge status="past-deadline" />
                    <Text fontSize="xs" color="fg.muted">
                      シフトを調整して 確定させましょう
                    </Text>
                  </Flex>
                  <Flex align="center" gap={2}>
                    <RecruitmentStatusBadge status="confirmed" />
                    <Stack gap={0.5}>
                      <Text fontSize="xs" color="fg.muted">
                        シフトを確定し スタッフに通知済みの状態
                      </Text>
                      <Text fontSize="xs" color="fg.muted">
                        確定後も編集やシフトの再送ができます
                      </Text>
                    </Stack>
                  </Flex>
                </Stack>
              </Stack>,
              <Stack key="3" gap={3}>
                <Text fontSize="sm">シフトを編集するにはカードのボタンを押します</Text>
                <Flex align="center" gap={2}>
                  <Button variant="outline" size="sm" gap={1.5} pointerEvents="none">
                    シフトを編集する
                    <LuArrowRight />
                  </Button>
                </Flex>
                <Text fontSize="xs" color="fg.muted">
                  スタッフの希望を見ながらシフトを組める画面に移動します
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  確定したあとも編集や再通知ができます
                </Text>
              </Stack>,
            ]}
          />
        </Flex>
        <Button size="sm" colorPalette="teal" onClick={onCreateClick}>
          <LuCalendarPlus />
          シフト希望を集める
        </Button>
      </Flex>
      {recruitments.length === 0 ? (
        <Box border="1px solid" borderColor="gray.200" borderRadius="lg">
          <Empty
            icon={LuClipboardList}
            title="シフトがありません"
            description="新しいシフトを作成して、スタッフの希望を集めましょう"
            minH="160px"
          />
        </Box>
      ) : (
        <Stack gap={3}>
          {recruitments.map((recruitment) => (
            <RecruitmentCard key={recruitment._id} recruitment={recruitment} onOpenShiftBoard={onOpenShiftBoard} />
          ))}
          <LoadMoreButton status={status} onLoadMore={onLoadMore} icon={<LuChevronDown />} label="もっと見る" />
        </Stack>
      )}
    </Stack>
  );
}

"use client";

import {
  Box,
  Button,
  Card,
  Container,
  Field,
  Flex,
  Heading,
  Input,
  Stack,
  Switch,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HiArrowLeft } from "react-icons/hi";
import { Animation } from "@/src/components/templates/Animation";

export const CreateShop = () => {
  const navigate = useNavigate();
  const [timeUnit, setTimeUnit] = useState("15");
  const [submitFrequency, setSubmitFrequency] = useState("weekly");

  return (
    <Animation>
      <Container maxW="container.md" py={8}>
        <VStack gap={8} align="stretch">
          {/* ヘッダー */}
          <Box>
            <Button onClick={() => navigate({ to: "/mypage" })} variant="ghost" mb={4}>
              <HiArrowLeft />
              マイページに戻る
            </Button>
            <Heading size="xl">新規店舗作成</Heading>
            <Text color="gray.600" mt={2}>
              店舗の基本情報を入力してください
            </Text>
          </Box>

          {/* フォーム */}
          <Card.Root>
            <Card.Body>
              <Stack gap={6}>
                {/* 店舗名 */}
                <Field.Root>
                  <Field.Label>店舗名 *</Field.Label>
                  <Field.HelperText>お客様に表示される店舗の名前です</Field.HelperText>
                  <Input placeholder="例: カフェ渋谷店" size="lg" />
                </Field.Root>

                {/* 営業時間 */}
                <Box>
                  <Text fontWeight="medium" mb={4}>
                    営業時間 *
                  </Text>
                  <Flex gap={4} align="end">
                    <Field.Root flex={1}>
                      <Field.Label>開店時間</Field.Label>
                      <Input type="time" defaultValue="09:00" />
                    </Field.Root>
                    <Text mb={2}>〜</Text>
                    <Field.Root flex={1}>
                      <Field.Label>閉店時間</Field.Label>
                      <Input type="time" defaultValue="22:00" />
                    </Field.Root>
                  </Flex>
                </Box>

                {/* シフト時間単位 */}
                <Field.Root>
                  <Field.Label>シフト時間単位 *</Field.Label>
                  <Field.HelperText>シフトを何分単位で管理するか設定します</Field.HelperText>
                  <select
                    value={timeUnit}
                    onChange={(e) => setTimeUnit(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      borderRadius: "0.25rem",
                      border: "1px solid #e2e8f0",
                      backgroundColor: "transparent",
                    }}
                  >
                    <option value="15">15分単位</option>
                    <option value="30">30分単位</option>
                    <option value="60">60分単位</option>
                  </select>
                </Field.Root>

                {/* シフト提出頻度 */}
                <Field.Root>
                  <Field.Label>シフト提出頻度 *</Field.Label>
                  <Field.HelperText>スタッフがシフトを提出する頻度を設定します</Field.HelperText>
                  <select
                    value={submitFrequency}
                    onChange={(e) => setSubmitFrequency(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      borderRadius: "0.25rem",
                      border: "1px solid #e2e8f0",
                      backgroundColor: "transparent",
                    }}
                  >
                    <option value="weekly">週ごと</option>
                    <option value="biweekly">2週間ごと</option>
                    <option value="monthly">月ごと</option>
                  </select>
                </Field.Root>

                {/* タイムカード機能 */}
                <Field.Root>
                  <Flex justify="space-between" align="center">
                    <Box>
                      <Field.Label>タイムカード機能</Field.Label>
                      <Field.HelperText>出退勤の打刻機能を使用するかどうか</Field.HelperText>
                    </Box>
                    <Switch.Root defaultChecked>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch.Root>
                  </Flex>
                </Field.Root>

                {/* 店舗メモ（マネージャー向け） */}
                <Field.Root>
                  <Field.Label>店舗メモ（マネージャー向け）</Field.Label>
                  <Field.HelperText>
                    運営上の注意事項、業務ルール、引き継ぎ事項など（主にマネージャーが参照）
                  </Field.HelperText>
                  <Textarea placeholder="例: レジ締め時の注意点、特別な清掃ルール、緊急時の連絡先など" rows={4} />
                </Field.Root>

                {/* 送信ボタン */}
                <Flex gap={4} justify="flex-end" mt={6}>
                  <Button onClick={() => navigate({ to: "/mypage" })} variant="outline">
                    キャンセル
                  </Button>
                  <Button colorPalette="teal" variant="solid">
                    店舗を作成
                  </Button>
                </Flex>
              </Stack>
            </Card.Body>
          </Card.Root>
        </VStack>
      </Container>
    </Animation>
  );
};

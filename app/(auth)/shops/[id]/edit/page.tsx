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
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { HiArrowLeft, HiSave } from "react-icons/hi";
import { Animation } from "@/src/components/templates/Animation";

export const runtime = "edge";

// 仮のデータ取得
const getMockShopData = (id: string) => {
  const shops = {
    "1": {
      id: "1",
      shopName: "カフェ渋谷店",
      openTime: "09:00",
      closeTime: "22:00",
      timeUnit: "15",
      submitFrequency: "weekly",
      useTimeCard: true,
      description: "レジ締め時は必ず店長に報告。清掃は閉店30分前から開始。",
    },
  };
  return shops[id as keyof typeof shops];
};

export default function ShopEditPage() {
  const params = useParams();
  const router = useRouter();
  const shopId = params.id as string;

  const shopData = getMockShopData(shopId);

  const [formData, setFormData] = useState({
    shopName: shopData?.shopName || "",
    openTime: shopData?.openTime || "09:00",
    closeTime: shopData?.closeTime || "22:00",
    timeUnit: shopData?.timeUnit || "15",
    submitFrequency: shopData?.submitFrequency || "weekly",
    useTimeCard: shopData?.useTimeCard || true,
    description: shopData?.description || "",
  });

  const [hasChanges, setHasChanges] = useState(false);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    // TODO: 実際の保存処理
    console.log("保存:", formData);
    router.push(`/shops/${shopId}`);
  };

  const handleCancel = () => {
    if (hasChanges) {
      if (confirm("変更が保存されていません。破棄しますか？")) {
        router.push(`/shops/${shopId}`);
      }
    } else {
      router.push(`/shops/${shopId}`);
    }
  };

  if (!shopData) {
    return (
      <Animation>
        <Container maxW="container.xl" py={8}>
          <Text>店舗が見つかりません</Text>
        </Container>
      </Animation>
    );
  }

  return (
    <Animation>
      <Container maxW="container.md" py={8}>
        <VStack gap={8} align="stretch">
          {/* ヘッダー */}
          <Box>
            <Button onClick={handleCancel} variant="ghost" mb={4}>
              <HiArrowLeft />
              店舗詳細に戻る
            </Button>
            <Flex justify="space-between" align="center">
              <Box>
                <Heading size="xl">店舗設定の編集</Heading>
                <Text color="fg.muted" mt={2}>
                  店舗の基本情報と運営設定を変更できます
                </Text>
              </Box>
              {hasChanges && (
                <Text fontSize="sm" color="orange.600" fontWeight="medium">
                  未保存の変更があります
                </Text>
              )}
            </Flex>
          </Box>

          {/* フォーム */}
          <Card.Root>
            <Card.Body>
              <Stack gap={6}>
                {/* 店舗名 */}
                <Field.Root>
                  <Field.Label>店舗名 *</Field.Label>
                  <Field.HelperText>お客様に表示される店舗の名前です</Field.HelperText>
                  <Input
                    value={formData.shopName}
                    onChange={(e) => handleInputChange("shopName", e.target.value)}
                    placeholder="例: カフェ渋谷店"
                    size="lg"
                  />
                </Field.Root>

                {/* 営業時間 */}
                <Box>
                  <Text fontWeight="medium" mb={4}>
                    営業時間 *
                  </Text>
                  <Flex gap={4} align="end">
                    <Field.Root flex={1}>
                      <Field.Label>開店時間</Field.Label>
                      <Input
                        type="time"
                        value={formData.openTime}
                        onChange={(e) => handleInputChange("openTime", e.target.value)}
                      />
                    </Field.Root>
                    <Text mb={2}>〜</Text>
                    <Field.Root flex={1}>
                      <Field.Label>閉店時間</Field.Label>
                      <Input
                        type="time"
                        value={formData.closeTime}
                        onChange={(e) => handleInputChange("closeTime", e.target.value)}
                      />
                    </Field.Root>
                  </Flex>
                </Box>

                {/* シフト時間単位 */}
                <Field.Root>
                  <Field.Label>シフト時間単位 *</Field.Label>
                  <Field.HelperText>シフトを何分単位で管理するか設定します</Field.HelperText>
                  <select
                    value={formData.timeUnit}
                    onChange={(e) => handleInputChange("timeUnit", e.target.value)}
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
                    value={formData.submitFrequency}
                    onChange={(e) => handleInputChange("submitFrequency", e.target.value)}
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
                    <Switch.Root
                      checked={formData.useTimeCard}
                      onCheckedChange={(checked) => handleInputChange("useTimeCard", checked.checked)}
                    >
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
                  <Textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange("description", e.target.value)}
                    placeholder="例: レジ締め時の注意点、特別な清掃ルール、緊急時の連絡先など"
                    rows={4}
                  />
                </Field.Root>

                {/* 保存・キャンセルボタン */}
                <Flex gap={4} justify="flex-end" mt={6}>
                  <Button onClick={handleCancel} variant="outline">
                    キャンセル
                  </Button>
                  <Button onClick={handleSave} colorPalette="teal" variant="solid" disabled={!hasChanges}>
                    <HiSave />
                    変更を保存
                  </Button>
                </Flex>
              </Stack>
            </Card.Body>
          </Card.Root>

          {/* 変更内容のプレビュー（変更がある場合のみ） */}
          {hasChanges && (
            <Card.Root bg="blue.50" borderLeft="4px solid" borderColor="blue.400">
              <Card.Body py={4}>
                <Text fontSize="sm" color="blue.700" fontWeight="medium" mb={2}>
                  📝 変更内容をプレビュー
                </Text>
                <Text fontSize="sm" color="blue.600">
                  保存すると、スタッフにも変更が反映されます。
                  特に営業時間やシフト設定の変更は、現在のシフトに影響する可能性があります。
                </Text>
              </Card.Body>
            </Card.Root>
          )}
        </VStack>
      </Container>
    </Animation>
  );
}

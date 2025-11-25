import { Box, Button, Card, Field, Flex, Heading, Icon, Input, List, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { useAtom } from "jotai";
import { useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { LuCheck, LuCopy, LuInfo, LuLink2, LuUserPlus } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Select } from "@/src/components/ui/Select";
import { toaster } from "@/src/components/ui/toaster";
import { Tooltip } from "@/src/components/ui/tooltip";
import { userAtom } from "@/src/stores/user";
import { roleOptions, type SchemaType, schema } from "./schema";

// 招待完了コンポーネント
type InviteCompleteProps = {
  generatedUrl: string;
  onCreateAnother: () => void;
};

export const InviteComplete = ({ generatedUrl, onCreateAnother }: InviteCompleteProps) => {
  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(generatedUrl);
      toaster.create({
        description: "URLをコピーしました",
        type: "success",
      });
    } catch {
      toaster.create({
        description: "コピーに失敗しました",
        type: "error",
      });
    }
  };

  return (
    <Box>
      <Card.Root variant="elevated">
        <Card.Body p={{ base: 4, md: 6 }}>
          <Flex align="center" gap={3} mb={4}>
            <Flex p={2} bg="green.50" borderRadius="lg">
              <Icon as={LuCheck} boxSize={5} color="green.600" />
            </Flex>
            <Box flex={1}>
              <Heading as="h3" size="md" color="gray.900" mb={1}>
                招待メールを送りました
              </Heading>
              <Text fontSize="xs" color="gray.600">
                下記のURLを招待したい方に共有してください
              </Text>
            </Box>
          </Flex>

          <Box mb={4} p={3} bg="gray.50" borderRadius="md">
            <Text fontSize="sm" color="gray.700" wordBreak="break-all">
              {generatedUrl}
            </Text>
          </Box>

          <Stack gap={3}>
            <Button onClick={handleCopyUrl} colorPalette="teal" w="full" gap={2}>
              <Icon as={LuCopy} boxSize={4} />
              招待URLをコピー
            </Button>
            <Button onClick={onCreateAnother} variant="outline" w="full">
              別のスタッフを招待する
            </Button>
          </Stack>
        </Card.Body>
      </Card.Root>
    </Box>
  );
};

// 招待フォームコンポーネント
type InviteFormProps = {
  shopId: string;
  onSuccess: (url: string) => void;
};

export const InviteForm = ({ shopId, onSuccess }: InviteFormProps) => {
  const [user] = useAtom(userAtom);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createInvitation = useMutation(api.invite.createInvitation);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SchemaType>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: "",
      email: "",
      role: "general",
    },
  });

  const role = watch("role");

  const onSubmit: SubmitHandler<SchemaType> = async (data) => {
    if (!user.authId) {
      setSubmitError("ログイン情報が取得できません");
      return;
    }

    setSubmitError(null);

    try {
      const result = await createInvitation({
        shopId: shopId as Id<"shops">,
        displayName: data.displayName.trim(),
        role: data.role,
        authId: user.authId,
      });

      if (result.success) {
        const url = `${window.location.origin}/invite?token=${result.data.token}`;
        onSuccess(url);
        reset();
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "招待URLの生成に失敗しました");
    }
  };

  return (
    <Box as="form" onSubmit={handleSubmit(onSubmit)}>
      <Card.Root variant="elevated">
        <Card.Body p={{ base: 4, md: 6 }}>
          <Flex align="flex-start" gap={3} mb={4}>
            <Flex p={2} bg="teal.50" borderRadius="lg">
              <Icon as={LuUserPlus} boxSize={5} color="teal.600" />
            </Flex>
            <Box flex={1}>
              <Heading as="h3" size="md" color="gray.900" mb={1}>
                スタッフを招待
              </Heading>
              <Text fontSize="xs" color="gray.600">
                招待メールを送ることができます
              </Text>
            </Box>
          </Flex>

          {/* 説明文 */}
          <List.Root as="ul" fontSize="xs" color="gray.500" gap={0.5} mb={4} pl={5}>
            <List.Item>招待URLの有効期限は14日間です</List.Item>
            <List.Item>1つのURLは1回のみ使用可能です</List.Item>
          </List.Root>

          {/* 送信エラー表示 */}
          {submitError && (
            <Box mb={4} p={3} bg="red.50" borderRadius="md" borderLeft="4px solid" borderColor="red.400">
              <Text fontSize="sm" color="red.700">
                {submitError}
              </Text>
            </Box>
          )}

          <Stack gap={4}>
            {/* 表示名入力 */}
            <Field.Root invalid={!!errors.displayName}>
              <Field.Label fontSize="sm" color="gray.700">
                表示名
              </Field.Label>
              <Input {...register("displayName")} type="text" placeholder="例: 田中 太郎" size="lg" />
              {errors.displayName && <Field.ErrorText>{errors.displayName.message}</Field.ErrorText>}
            </Field.Root>

            {/* メールアドレス入力 */}
            <Field.Root invalid={!!errors.email}>
              <Field.Label fontSize="sm" color="gray.700">
                メールアドレス
              </Field.Label>
              <Input {...register("email")} type="email" placeholder="例: tanaka@example.com" size="lg" />
              {errors.email && <Field.ErrorText>{errors.email.message}</Field.ErrorText>}
            </Field.Root>

            {/* 役割選択 */}
            <Field.Root>
              <Flex align="center" gap={1}>
                <Field.Label fontSize="sm" color="gray.700" mb={0}>
                  役割
                </Field.Label>
                <Tooltip
                  content={
                    <Box p={1}>
                      <Text fontWeight="bold" mb={1}>
                        スタッフ
                      </Text>
                      <Text fontSize="xs" mb={2}>
                        シフトの確認・提出ができます
                      </Text>
                      <Text fontWeight="bold" mb={1}>
                        マネージャー
                      </Text>
                      <Text fontSize="xs">シフトの作成・編集、スタッフの招待ができます</Text>
                    </Box>
                  }
                >
                  <Icon as={LuInfo} boxSize={4} color="gray.400" cursor="help" />
                </Tooltip>
              </Flex>
              <Select items={roleOptions} value={role} onChange={(value) => setValue("role", value)} />
            </Field.Root>

            {/* 生成ボタン */}
            <Button type="submit" w="full" colorPalette="teal" variant="solid" size="lg" gap={2} loading={isSubmitting}>
              <Icon as={LuLink2} boxSize={4} />
              招待メールを送る
            </Button>
          </Stack>
        </Card.Body>
      </Card.Root>
    </Box>
  );
};

// メインコンポーネント（state管理）
type SendTabProps = {
  shopId: string;
};

export const SendTab = ({ shopId }: SendTabProps) => {
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  const handleSuccess = (url: string) => {
    setGeneratedUrl(url);
  };

  const handleCreateAnother = () => {
    setGeneratedUrl(null);
  };

  if (generatedUrl) {
    return <InviteComplete generatedUrl={generatedUrl} onCreateAnother={handleCreateAnother} />;
  }

  return <InviteForm shopId={shopId} onSuccess={handleSuccess} />;
};

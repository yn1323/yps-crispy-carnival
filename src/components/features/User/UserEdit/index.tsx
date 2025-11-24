import {
  Box,
  Button,
  Container,
  DialogActionTrigger,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
  Field,
  Flex,
  Heading,
  Icon,
  Input,
  List,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { LuClock, LuDollarSign, LuFileText, LuSave, LuShield, LuTriangle, LuUser, LuUserX } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { FormCard } from "@/src/components/ui/FormCard";
import { Select } from "@/src/components/ui/Select";
import { Title } from "@/src/components/ui/Title";
import { toaster } from "@/src/components/ui/toaster";
import { type SchemaType, schema } from "./schema";

type Props = {
  user: Doc<"users">;
  shopId: string;
  callbackRoutingPath?: string;
};

export const UserEdit = ({ user, shopId, callbackRoutingPath }: Props) => {
  const navigate = useNavigate();
  const updateUser = useMutation(api.user.updateUser);

  // 店舗情報を取得
  const shop = useQuery(api.shop.getShopById, { shopId: shopId as Id<"shops"> });
  const {
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<SchemaType>({
    resolver: zodResolver(schema),
    defaultValues: {
      userName: user.name,
    },
  });

  const onSubmit: SubmitHandler<SchemaType> = async (data) => {
    try {
      await updateUser({
        id: user._id,
        name: data.userName,
      });

      toaster.create({
        description: "ユーザー情報を更新しました",
        type: "success",
      });
      navigate({ to: callbackRoutingPath ?? `/shops/${shopId}/staffs/${user._id}` });
    } catch (error) {
      console.error("ユーザー更新エラー:", error);
      toaster.create({
        description: "ユーザー情報の更新に失敗しました",
        type: "error",
      });
    }
  };

  return (
    <Container maxW="6xl">
      {/* ヘッダー */}
      <Title prev={{ url: `/shops/${shopId}/staffs/${user._id}`, label: "スタッフ詳細に戻る" }}>
        <Box>
          <Flex align="center" gap={3} mb={2}>
            <Flex p={{ base: 2, md: 3 }} bg="teal.50" borderRadius="lg">
              <Icon as={LuUser} boxSize={6} color="teal.600" />
            </Flex>
            <Heading as="h2" size="xl" color="gray.900">
              スタッフ編集
            </Heading>
          </Flex>
          <Text fontSize="sm" color="gray.600">
            {user.name} - {shop?.shopName ?? "店舗情報読み込み中..."}
          </Text>
        </Box>
      </Title>

      <Box
        as="form"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(onSubmit)(e);
        }}
      >
        <Stack gap={6}>
          {/* 基本情報 */}
          <FormCard icon={LuShield} iconColor="gray.700" title="基本情報">
            <Stack gap={4}>
              {/* 権限 */}
              <Field.Root>
                <Field.Label>権限</Field.Label>
                <Select
                  items={[
                    { value: "スタッフ", label: "スタッフ" },
                    { value: "マネージャー", label: "マネージャー" },
                    { value: "オーナー", label: "オーナー" },
                  ]}
                  value="スタッフ"
                  onChange={() => {}}
                  placeholder="選択してください"
                />
                <Field.HelperText>マネージャーはシフト管理・スタッフ管理が可能です</Field.HelperText>
              </Field.Root>

              {/* 最大勤務時間/月 */}
              <Field.Root>
                <Field.Label>最大勤務時間/月（任意）</Field.Label>
                <Flex align="center" gap={2}>
                  <Flex align="center" gap={2} flex={1}>
                    <Icon as={LuClock} boxSize={4} color="gray.500" />
                    <Input type="number" min="0" step="1" placeholder="160" />
                  </Flex>
                  <Text fontSize="sm" color="gray.600" minW="fit-content">
                    時間
                  </Text>
                </Flex>
                <Field.HelperText>設定すると、この時間を超えないようアラートが表示されます</Field.HelperText>
              </Field.Root>

              {/* 時給 */}
              <Field.Root>
                <Field.Label>時給（任意）</Field.Label>
                <Flex align="center" gap={2}>
                  <Flex align="center" gap={2} flex={1}>
                    <Icon as={LuDollarSign} boxSize={4} color="gray.500" />
                    <Input type="number" min="0" step="1" placeholder="1200" />
                  </Flex>
                  <Text fontSize="sm" color="gray.600" minW="fit-content">
                    円
                  </Text>
                </Flex>
                <Field.HelperText>人件費計算に使用されます</Field.HelperText>
              </Field.Root>
            </Stack>
          </FormCard>

          {/* スタッフメモ */}
          <FormCard icon={LuFileText} iconColor="gray.700" title="スタッフメモ">
            <Stack gap={4}>
              <Field.Root>
                <Field.Label>メモ（管理者のみ閲覧可能・任意）</Field.Label>
                <Textarea placeholder="例：シフト希望、スキル、注意事項など" minH="150px" resize="none" />
                <Field.HelperText>このスタッフに関する管理メモを記録できます</Field.HelperText>
              </Field.Root>
            </Stack>
          </FormCard>

          {/* 保存ボタン */}
          <Button
            type="submit"
            disabled={isSubmitting}
            w="full"
            colorPalette="teal"
            loading={isSubmitting}
            gap={2}
            size="lg"
          >
            <Icon as={LuSave} boxSize={4} />
            変更を保存
          </Button>

          {/* 退職処理 */}
          <FormCard icon={LuTriangle} iconColor="red.600" title="退職処理">
            {/* 警告ボックス */}
            <Box bg="red.50" p={4} borderRadius="md" mb={4}>
              <Text fontSize="sm" color="red.800" fontWeight="medium" mb={2}>
                ⚠️ この操作は慎重に行ってください
              </Text>
              <Text fontSize="xs" color="red.700" mb={3}>
                スタッフを退職処理すると、以下の影響があります：
              </Text>
              <List.Root fontSize="xs" color="red.700" gap={1}>
                <List.Item>このスタッフは店舗スタッフから削除されます</List.Item>
                <List.Item>過去のシフト履歴・勤怠記録は保持されます</List.Item>
                <List.Item>再度招待することで復帰が可能です</List.Item>
                <List.Item>退職日は記録され、統計データに反映されます</List.Item>
              </List.Root>
            </Box>

            {/* 退職処理ダイアログ */}
            <DialogRoot>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  borderColor="red.500"
                  color="red.600"
                  _hover={{ bg: "red.50" }}
                  gap={2}
                  w="full"
                >
                  <Icon as={LuUserX} boxSize={4} />
                  退職処理を実行
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>退職処理の確認</DialogTitle>
                </DialogHeader>
                <DialogBody>
                  <Text mb={2}>本当に {user.name} を退職処理しますか？</Text>
                  <Text fontSize="sm" color="gray.600">
                    この操作により、スタッフは店舗スタッフから削除されます。過去の記録は保持され、後で再招待することも可能です。
                  </Text>
                </DialogBody>
                <DialogFooter>
                  <DialogActionTrigger asChild>
                    <Button variant="outline">キャンセル</Button>
                  </DialogActionTrigger>
                  <Button colorPalette="red">退職処理を実行</Button>
                </DialogFooter>
                <DialogCloseTrigger />
              </DialogContent>
            </DialogRoot>
          </FormCard>
        </Stack>
      </Box>
    </Container>
  );
};

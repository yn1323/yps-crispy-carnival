import {
  Box,
  Button,
  Card,
  Container,
  Field,
  Flex,
  Heading,
  Icon,
  IconButton,
  Input,
  List,
  Skeleton,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { LuPlus, LuSave, LuTrash2, LuTriangleAlert, LuUser, LuUserX } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { Select } from "@/src/components/ui/Select";
import { Title } from "@/src/components/ui/Title";
import { toaster } from "@/src/components/ui/toaster";
import { DEFAULT_POSITIONS, SKILL_LEVELS, type SkillLevelType } from "@/src/constants/validations";
import { userAtom } from "@/src/stores/user";
import { type StaffEditFormValues, staffEditSchema } from "./schema";

type StaffType = {
  _id: Id<"staffs">;
  email: string;
  displayName: string;
  status: string;
  skills: { position: string; level: string }[];
  maxWeeklyHours: number | undefined;
  memo: string;
  workStyleNote: string;
  hourlyWage: number | null;
  resignedAt: number | undefined;
  resignationReason: string | undefined;
  createdAt: number;
};

// スキルのlevelを型安全に変換
const convertSkillsToFormValues = (
  skills: { position: string; level: string }[],
): { position: string; level: SkillLevelType }[] => {
  return skills
    .filter((skill) => SKILL_LEVELS.includes(skill.level as SkillLevelType))
    .map((skill) => ({
      position: skill.position,
      level: skill.level as SkillLevelType,
    }));
};

type ShopType = {
  _id: Id<"shops">;
  shopName: string;
};

type StaffEditProps = {
  staff: StaffType;
  shop: ShopType;
};

export const StaffEdit = ({ staff, shop }: StaffEditProps) => {
  const navigate = useNavigate();
  const user = useAtomValue(userAtom);
  const updateStaffInfo = useMutation(api.shop.mutations.updateStaffInfo);
  const resignStaff = useMutation(api.shop.mutations.resignStaff);

  const [resignationReason, setResignationReason] = useState("");
  const [isResigning, setIsResigning] = useState(false);
  const resignDialog = useDialog();

  // 自分自身かどうかをチェック（メールアドレスで判定）
  const isSelf = user.email === staff.email;

  const handleResign = async () => {
    if (!user.authId) return;

    setIsResigning(true);
    try {
      await resignStaff({
        shopId: shop._id,
        staffId: staff._id,
        authId: user.authId,
        resignationReason: resignationReason || undefined,
      });

      toaster.success({
        title: `${staff.displayName} を退職処理しました`,
      });
      resignDialog.close();
      navigate({
        to: "/shops/$shopId",
        params: { shopId: shop._id },
        search: { tab: "staff" },
      });
    } catch (error) {
      toaster.error({
        title: "退職処理に失敗しました",
        description: error instanceof Error ? error.message : "エラーが発生しました",
      });
    } finally {
      setIsResigning(false);
    }
  };

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<StaffEditFormValues>({
    resolver: zodResolver(staffEditSchema),
    defaultValues: {
      email: staff.email,
      displayName: staff.displayName,
      skills: convertSkillsToFormValues(staff.skills),
      maxWeeklyHours: staff.maxWeeklyHours ?? "",
      memo: staff.memo ?? "",
      workStyleNote: staff.workStyleNote ?? "",
      hourlyWage: staff.hourlyWage ?? "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "skills",
  });

  const onSubmit = async (data: StaffEditFormValues) => {
    if (!user.authId) return;

    try {
      await updateStaffInfo({
        shopId: shop._id,
        staffId: staff._id,
        authId: user.authId,
        email: data.email,
        displayName: data.displayName,
        skills: data.skills.map((skill) => ({
          position: skill.position,
          level: skill.level,
        })),
        maxWeeklyHours: typeof data.maxWeeklyHours === "number" ? data.maxWeeklyHours : null,
        memo: data.memo ?? "",
        workStyleNote: data.workStyleNote ?? "",
        hourlyWage: typeof data.hourlyWage === "number" ? data.hourlyWage : null,
      });

      toaster.success({
        title: "スタッフ情報を更新しました",
      });

      navigate({
        to: "/shops/$shopId/staffs/$staffId",
        params: { shopId: shop._id, staffId: staff._id },
      });
    } catch (error) {
      toaster.error({
        title: "スタッフ情報の更新に失敗しました",
        description: error instanceof Error ? error.message : "エラーが発生しました",
      });
    }
  };

  return (
    <Container maxW="6xl">
      <Title prev={{ url: `/shops/${shop._id}/staffs/${staff._id}`, label: "スタッフ詳細に戻る" }}>
        <Flex align="center" gap={4}>
          {/* アバター */}
          <Flex
            w={{ base: 12, md: 16 }}
            h={{ base: 12, md: 16 }}
            borderRadius="full"
            bgGradient="to-br"
            gradientFrom="teal.400"
            gradientTo="teal.600"
            align="center"
            justify="center"
            color="white"
            flexShrink={0}
          >
            <Text fontSize={{ base: "xl", md: "2xl" }} fontWeight="bold">
              {staff.displayName.slice(0, 2).toUpperCase()}
            </Text>
          </Flex>

          <Box>
            <Heading as="h2" size="lg" color="gray.900">
              {staff.displayName} の編集
            </Heading>
          </Box>
        </Flex>
      </Title>

      <form onSubmit={handleSubmit(onSubmit)}>
        <VStack align="stretch" gap={6}>
          {/* 基本情報カード */}
          <Card.Root>
            <Card.Header>
              <Heading as="h3" size="md">
                基本情報
              </Heading>
            </Card.Header>
            <Card.Body pt={0}>
              <VStack align="stretch" gap={4}>
                {/* メールアドレス */}
                <Field.Root invalid={!!errors.email} required>
                  <Field.Label>メールアドレス</Field.Label>
                  <Input {...register("email")} type="email" placeholder="example@example.com" />
                  <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
                </Field.Root>

                {/* 表示名 */}
                <Field.Root invalid={!!errors.displayName} required>
                  <Field.Label>表示名</Field.Label>
                  <Input {...register("displayName")} placeholder="表示名を入力" />
                  <Field.ErrorText>{errors.displayName?.message}</Field.ErrorText>
                </Field.Root>

                {/* 週最大勤務時間 */}
                <Field.Root invalid={!!errors.maxWeeklyHours}>
                  <Field.Label>週最大勤務時間</Field.Label>
                  <Controller
                    control={control}
                    name="maxWeeklyHours"
                    render={({ field }) => (
                      <Input
                        type="number"
                        placeholder="例: 40"
                        value={field.value === "" || field.value === null ? "" : field.value}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value === "" ? "" : Number(value));
                        }}
                      />
                    )}
                  />
                  <Field.ErrorText>{errors.maxWeeklyHours?.message}</Field.ErrorText>
                </Field.Root>

                {/* 時給 */}
                <Field.Root invalid={!!errors.hourlyWage}>
                  <Field.Label>時給</Field.Label>
                  <Controller
                    control={control}
                    name="hourlyWage"
                    render={({ field }) => (
                      <Input
                        type="number"
                        placeholder="例: 1200"
                        value={field.value === "" || field.value === null ? "" : field.value}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value === "" ? "" : Number(value));
                        }}
                      />
                    )}
                  />
                  <Field.ErrorText>{errors.hourlyWage?.message}</Field.ErrorText>
                </Field.Root>
              </VStack>
            </Card.Body>
          </Card.Root>

          {/* スキルカード */}
          <Card.Root>
            <Card.Header>
              <Flex justify="space-between" align="center">
                <Heading as="h3" size="md">
                  スキル
                </Heading>
                <Button
                  size="sm"
                  colorPalette="teal"
                  onClick={() => append({ position: DEFAULT_POSITIONS[0], level: SKILL_LEVELS[0] })}
                >
                  <Icon as={LuPlus} boxSize={4} mr={1} />
                  スキルを追加
                </Button>
              </Flex>
            </Card.Header>
            <Card.Body pt={0}>
              <VStack align="stretch" gap={3}>
                {fields.length === 0 ? (
                  <Text color="gray.500" fontSize="sm">
                    スキルが登録されていません
                  </Text>
                ) : (
                  fields.map((field, index) => (
                    <Flex key={field.id} gap={3} align="flex-end">
                      <Box flex={1}>
                        <Field.Root invalid={!!errors.skills?.[index]?.position}>
                          {index === 0 && <Field.Label>ポジション</Field.Label>}
                          <Controller
                            control={control}
                            name={`skills.${index}.position`}
                            render={({ field }) => (
                              <Select
                                items={DEFAULT_POSITIONS.map((p) => ({ value: p, label: p }))}
                                value={field.value}
                                onChange={field.onChange}
                              />
                            )}
                          />
                          <Field.ErrorText>{errors.skills?.[index]?.position?.message}</Field.ErrorText>
                        </Field.Root>
                      </Box>
                      <Box flex={1}>
                        <Field.Root invalid={!!errors.skills?.[index]?.level}>
                          {index === 0 && <Field.Label>レベル</Field.Label>}
                          <Controller
                            control={control}
                            name={`skills.${index}.level`}
                            render={({ field }) => (
                              <Select
                                items={SKILL_LEVELS.map((l) => ({ value: l, label: l }))}
                                value={field.value}
                                onChange={field.onChange}
                              />
                            )}
                          />
                          <Field.ErrorText>{errors.skills?.[index]?.level?.message}</Field.ErrorText>
                        </Field.Root>
                      </Box>
                      <IconButton
                        aria-label="スキルを削除"
                        colorPalette="red"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                      >
                        <Icon as={LuTrash2} boxSize={4} />
                      </IconButton>
                    </Flex>
                  ))
                )}
              </VStack>
            </Card.Body>
          </Card.Root>

          {/* メモカード */}
          <Card.Root>
            <Card.Header>
              <Heading as="h3" size="md">
                メモ
              </Heading>
            </Card.Header>
            <Card.Body pt={0}>
              <VStack align="stretch" gap={4}>
                {/* スタッフメモ */}
                <Field.Root invalid={!!errors.memo}>
                  <Field.Label>スタッフメモ</Field.Label>
                  <Textarea {...register("memo")} placeholder="スタッフに関するメモを入力" rows={3} />
                  <Field.ErrorText>{errors.memo?.message}</Field.ErrorText>
                </Field.Root>

                {/* 勤務スタイルメモ */}
                <Field.Root invalid={!!errors.workStyleNote}>
                  <Field.Label>勤務スタイルメモ</Field.Label>
                  <Textarea
                    {...register("workStyleNote")}
                    placeholder="勤務スタイルに関するメモを入力（例: 土日のみ勤務可能）"
                    rows={3}
                  />
                  <Field.ErrorText>{errors.workStyleNote?.message}</Field.ErrorText>
                </Field.Root>
              </VStack>
            </Card.Body>
          </Card.Root>

          {/* 送信ボタン */}
          <Flex justify="flex-end" gap={3}>
            <Link to="/shops/$shopId/staffs/$staffId" params={{ shopId: shop._id, staffId: staff._id }}>
              <Button variant="outline" colorPalette="gray">
                キャンセル
              </Button>
            </Link>
            <Button type="submit" colorPalette="teal" loading={isSubmitting} gap={2}>
              <Icon as={LuSave} boxSize={4} />
              保存
            </Button>
          </Flex>
        </VStack>
      </form>

      {/* 退職処理（在籍中の場合のみ表示） */}
      {staff.status === "active" && (
        <Card.Root mt={6} borderColor="red.200">
          <Card.Header>
            <Flex align="center" gap={2}>
              <Icon as={LuTriangleAlert} boxSize={5} color="red.600" />
              <Heading as="h3" size="md" color="red.600">
                退職処理
              </Heading>
            </Flex>
          </Card.Header>
          <Card.Body pt={0}>
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
              </List.Root>
            </Box>

            {/* 自分自身の場合の注意メッセージ */}
            {isSelf && (
              <Text fontSize="sm" color="gray.600" mb={4}>
                ※ 自分自身を退職処理することはできません
              </Text>
            )}

            {/* 退職処理ボタン */}
            <Button
              variant="outline"
              borderColor={isSelf ? "gray.300" : "red.500"}
              color={isSelf ? "gray.400" : "red.600"}
              _hover={isSelf ? {} : { bg: "red.50" }}
              disabled={isSelf}
              gap={2}
              w="full"
              onClick={resignDialog.open}
            >
              <Icon as={LuUserX} boxSize={4} />
              退職処理を実行
            </Button>

            {/* 退職処理ダイアログ */}
            <Dialog
              title="退職処理の確認"
              isOpen={resignDialog.isOpen}
              onOpenChange={resignDialog.onOpenChange}
              onClose={resignDialog.close}
              closeLabel="キャンセル"
              onSubmit={handleResign}
              submitLabel="退職処理を実行"
              submitColorPalette="red"
              isLoading={isResigning}
              role="alertdialog"
            >
              <VStack align="stretch" gap={4}>
                <Text>本当に {staff.displayName} を退職処理しますか？</Text>
                <Text fontSize="sm" color="gray.600">
                  この操作により、スタッフは店舗スタッフから削除されます。過去の記録は保持され、後で再招待することも可能です。
                </Text>
                <Field.Root>
                  <Field.Label>退職理由（任意）</Field.Label>
                  <Textarea
                    placeholder="例：契約満了、自己都合、など"
                    value={resignationReason}
                    onChange={(e) => setResignationReason(e.target.value)}
                    rows={3}
                  />
                </Field.Root>
              </VStack>
            </Dialog>
          </Card.Body>
        </Card.Root>
      )}
    </Container>
  );
};

// ローディング状態
export const StaffEditLoading = () => {
  return (
    <Container maxW="6xl" py={6}>
      <VStack align="stretch" gap={6}>
        <Skeleton height="40px" width="150px" />
        <Flex align="center" gap={4}>
          <Skeleton height="64px" width="64px" borderRadius="full" />
          <Box>
            <Skeleton height="28px" width="200px" />
          </Box>
        </Flex>
        <Card.Root>
          <Card.Body>
            <VStack align="stretch" gap={4}>
              <Skeleton height="40px" />
              <Skeleton height="40px" />
              <Skeleton height="40px" />
            </VStack>
          </Card.Body>
        </Card.Root>
      </VStack>
    </Container>
  );
};

// 見つからない状態
type StaffEditNotFoundProps = {
  shopId: string;
};

export const StaffEditNotFound = ({ shopId }: StaffEditNotFoundProps) => {
  return (
    <Container maxW="6xl" py={6}>
      <VStack align="center" gap={4} py={12}>
        <Icon as={LuUser} boxSize={16} color="gray.300" />
        <Text fontSize="lg" color="gray.500">
          スタッフが見つからないか、編集権限がありません
        </Text>
        <Link to="/shops/$shopId" params={{ shopId }} search={{ tab: "staff" }}>
          <Button colorPalette="teal">スタッフ一覧に戻る</Button>
        </Link>
      </VStack>
    </Container>
  );
};

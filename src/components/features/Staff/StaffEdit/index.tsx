import {
  Box,
  Button,
  Card,
  Container,
  Field,
  Flex,
  Heading,
  Icon,
  Input,
  List,
  SimpleGrid,
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
import { Controller, useForm } from "react-hook-form";
import { LuCheck, LuSave, LuTriangleAlert, LuUser, LuUserX } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { Empty } from "@/src/components/ui/Empty";
import { Title } from "@/src/components/ui/Title";
import { toaster } from "@/src/components/ui/toaster";
import { DEFAULT_POSITIONS, type PositionType, SKILL_LEVELS, type SkillLevelType } from "@/src/constants/validations";
import { userAtom } from "@/src/stores/user";
import { type SkillsFormValues, type StaffEditFormValues, staffEditSchema } from "./schema";

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

// 配列形式のスキルをオブジェクト形式に変換（フォーム用）
const convertSkillsArrayToObject = (skills: { position: string; level: string }[]): SkillsFormValues => {
  const result = {} as SkillsFormValues;

  // まず全ポジションを「未経験」で初期化
  for (const position of DEFAULT_POSITIONS) {
    result[position] = SKILL_LEVELS[0]; // "未経験"
  }

  // 既存のスキルデータで上書き
  for (const skill of skills) {
    if (
      DEFAULT_POSITIONS.includes(skill.position as PositionType) &&
      SKILL_LEVELS.includes(skill.level as SkillLevelType)
    ) {
      result[skill.position as PositionType] = skill.level as SkillLevelType;
    }
  }

  return result;
};

// オブジェクト形式のスキルを配列形式に変換（API送信用）
const convertSkillsObjectToArray = (skills: SkillsFormValues): { position: string; level: string }[] => {
  return DEFAULT_POSITIONS.map((position) => ({
    position,
    level: skills[position],
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

// スキルレベル選択ボタン
type SkillLevelButtonProps = {
  level: SkillLevelType;
  isSelected: boolean;
  onClick: () => void;
};

const SkillLevelButton = ({ level, isSelected, onClick }: SkillLevelButtonProps) => {
  return (
    <Button
      type="button"
      size="sm"
      variant={isSelected ? "solid" : "outline"}
      colorPalette={isSelected ? "teal" : "gray"}
      bg={isSelected ? "teal.50" : "gray.100"}
      color={isSelected ? "teal.700" : "gray.600"}
      borderWidth={isSelected ? "2px" : "1px"}
      borderColor={isSelected ? "teal.500" : "transparent"}
      _hover={{
        bg: isSelected ? "teal.100" : "gray.200",
        transform: "scale(1.02)",
      }}
      transition="all 0.15s ease"
      onClick={onClick}
      h={{ base: "44px", md: "40px" }}
      minW={0}
      px={2}
      gap={1}
    >
      {isSelected && <Icon as={LuCheck} boxSize={3} />}
      <Text fontSize={{ base: "xs", md: "sm" }}>{level}</Text>
    </Button>
  );
};

// スキルマトリックス（ポジションごとのレベル選択）
type SkillMatrixProps = {
  value: SkillsFormValues;
  onChange: (value: SkillsFormValues) => void;
};

const SkillMatrix = ({ value, onChange }: SkillMatrixProps) => {
  const handleLevelChange = (position: PositionType, level: SkillLevelType) => {
    onChange({
      ...value,
      [position]: level,
    });
  };

  return (
    <VStack align="stretch" gap={4}>
      {DEFAULT_POSITIONS.map((position) => (
        <Box key={position}>
          <Text fontWeight="medium" color="gray.700" mb={2} fontSize="sm">
            {position}
          </Text>
          <SimpleGrid columns={{ base: 2, md: 4 }} gap={2}>
            {SKILL_LEVELS.map((level) => (
              <SkillLevelButton
                key={level}
                level={level}
                isSelected={value[position] === level}
                onClick={() => handleLevelChange(position, level)}
              />
            ))}
          </SimpleGrid>
        </Box>
      ))}
    </VStack>
  );
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
      skills: convertSkillsArrayToObject(staff.skills),
      maxWeeklyHours: staff.maxWeeklyHours ?? "",
      memo: staff.memo ?? "",
      workStyleNote: staff.workStyleNote ?? "",
      hourlyWage: staff.hourlyWage ?? "",
    },
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
        skills: convertSkillsObjectToArray(data.skills),
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
              <Heading as="h3" size="md">
                スキル
              </Heading>
            </Card.Header>
            <Card.Body pt={0}>
              <Controller
                control={control}
                name="skills"
                render={({ field }) => <SkillMatrix value={field.value} onChange={field.onChange} />}
              />
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
      {
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
                この操作は慎重に行ってください
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
      }
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

export const StaffEditNotFound = ({ shopId }: StaffEditNotFoundProps) => (
  <Container maxW="6xl" py={6}>
    <Empty
      icon={LuUser}
      title="スタッフが見つからないか、編集権限がありません"
      action={
        <Link to="/shops/$shopId" params={{ shopId }} search={{ tab: "staff" }}>
          <Button colorPalette="teal">スタッフ一覧に戻る</Button>
        </Link>
      }
    />
  </Container>
);

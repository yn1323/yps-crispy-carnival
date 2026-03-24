import {
  Box,
  Button,
  Card,
  Container,
  Field,
  Flex,
  Heading,
  Icon,
  List,
  Skeleton,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { LuTriangleAlert, LuUser, LuUserX } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  type PositionType,
  StaffEditForm,
  type StaffSkillType,
  type StaffType,
} from "@/src/components/features/Staff/StaffEditForm";
import type { StaffEditFormValues } from "@/src/components/features/Staff/StaffEditForm/schema";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { Empty } from "@/src/components/ui/Empty";
import { Title } from "@/src/components/ui/Title";
import { toaster } from "@/src/components/ui/toaster";
import { SKILL_LEVELS } from "@/src/constants/validations";
import { userAtom } from "@/src/stores/user";

type ShopType = {
  _id: Id<"shops">;
  shopName: string;
};

type StaffEditProps = {
  staff: StaffType;
  shop: ShopType;
  positions: PositionType[];
  staffSkills: StaffSkillType[];
};

export const StaffEdit = ({ staff, shop, positions, staffSkills }: StaffEditProps) => {
  const navigate = useNavigate();
  const user = useAtomValue(userAtom);
  const updateStaffInfo = useMutation(api.staff.mutations.updateStaffInfo);
  const resignStaff = useMutation(api.staff.mutations.resignStaff);

  const [resignationReason, setResignationReason] = useState("");
  const [isResigning, setIsResigning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const handleSubmit = async (data: StaffEditFormValues) => {
    if (!user.authId) return;

    setIsSubmitting(true);
    try {
      // スキルをpositionId + level形式に変換
      const skillsToSubmit = positions.map((position) => ({
        positionId: position._id,
        level: data.skills[position._id] || SKILL_LEVELS[0],
      }));

      await updateStaffInfo({
        shopId: shop._id,
        staffId: staff._id,
        authId: user.authId,
        email: data.email,
        displayName: data.displayName,
        skills: skillsToSubmit,
        memo: data.memo ?? "",
        workStyleNote: data.workStyleNote ?? "",
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
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate({
      to: "/shops/$shopId/staffs/$staffId",
      params: { shopId: shop._id, staffId: staff._id },
    });
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

      {/* 共通フォームコンポーネント */}
      <StaffEditForm
        staff={staff}
        positions={positions}
        staffSkills={staffSkills}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={isSubmitting}
      />

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

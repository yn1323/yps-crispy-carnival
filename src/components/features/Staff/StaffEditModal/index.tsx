import { Box, Button, Flex, Skeleton, Text, VStack } from "@chakra-ui/react";
import { useMutation, useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffDetailContent } from "@/src/components/features/Staff/StaffDetailContent";
import { StaffEditForm } from "@/src/components/features/Staff/StaffEditForm";
import type { StaffEditFormValues } from "@/src/components/features/Staff/StaffEditForm/schema";
import { Dialog } from "@/src/components/ui/Dialog";
import { toaster } from "@/src/components/ui/toaster";
import { SKILL_LEVELS } from "@/src/constants/validations";
import { userAtom } from "@/src/stores/user";

type ModalMode = "view" | "edit";

type StaffEditModalProps = {
  staffId: string;
  shopId: string;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  onSave?: () => void;
  viewOnly?: boolean;
};

export const StaffEditModal = ({
  staffId,
  shopId,
  isOpen,
  onOpenChange,
  onClose,
  onSave,
  viewOnly = false,
}: StaffEditModalProps) => {
  const user = useAtomValue(userAtom);
  const [mode, setMode] = useState<ModalMode>("view");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // APIからデータを取得
  const staff = useQuery(
    api.shop.queries.getStaffInfo,
    isOpen ? { shopId: shopId as Id<"shops">, staffId: staffId as Id<"staffs">, authId: user.authId ?? "" } : "skip",
  );

  const positions = useQuery(api.position.queries.listByShop, isOpen ? { shopId: shopId as Id<"shops"> } : "skip");

  const staffSkills = useQuery(
    api.staffSkill.queries.listByStaff,
    isOpen ? { staffId: staffId as Id<"staffs"> } : "skip",
  );

  const updateStaffInfo = useMutation(api.staff.mutations.updateStaffInfo);

  const isLoading = staff === undefined || positions === undefined || staffSkills === undefined;
  const hasError = staff === null;

  const handleSubmit = async (data: StaffEditFormValues) => {
    if (!user.authId || !staff) return;

    setIsSubmitting(true);
    try {
      const skillsToSubmit = (positions ?? []).map((position) => ({
        positionId: position._id,
        level: data.skills[position._id] || SKILL_LEVELS[0],
      }));

      await updateStaffInfo({
        shopId: shopId as Id<"shops">,
        staffId: staffId as Id<"staffs">,
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

      onSave?.();
      setMode("view");
    } catch (error) {
      toaster.error({
        title: "スタッフ情報の更新に失敗しました",
        description: error instanceof Error ? error.message : "エラーが発生しました",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = () => {
    setMode("edit");
  };

  const handleCancelEdit = () => {
    setMode("view");
  };

  const handleClose = () => {
    setMode("view");
    onClose();
  };

  const handleOpenChange = (details: { open: boolean }) => {
    if (!details.open) {
      setMode("view");
    }
    onOpenChange(details);
  };

  const title = staff ? (mode === "view" ? `${staff.displayName} の詳細` : `${staff.displayName} の編集`) : "スタッフ";

  return (
    <Dialog
      title={title}
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      onClose={handleClose}
      maxW="4xl"
      maxH="90vh"
      hideFooter
    >
      {isLoading && <StaffEditModalLoading />}

      {!isLoading && hasError && (
        <Box py={8} textAlign="center">
          <Text color="gray.500">スタッフ情報の取得に失敗しました</Text>
        </Box>
      )}

      {!isLoading &&
        !hasError &&
        staff &&
        positions &&
        staffSkills &&
        (mode === "view" ? (
          <VStack align="stretch" gap={4}>
            <StaffDetailContent staff={staff} positions={positions} staffSkills={staffSkills} />
            <Flex justify="flex-end" gap={3} pt={4}>
              <Button variant="outline" onClick={handleClose}>
                閉じる
              </Button>
              {!viewOnly && (
                <Button colorPalette="teal" onClick={handleEditClick}>
                  編集
                </Button>
              )}
            </Flex>
          </VStack>
        ) : (
          <StaffEditForm
            staff={staff}
            positions={positions}
            staffSkills={staffSkills}
            onSubmit={handleSubmit}
            onCancel={handleCancelEdit}
            isSubmitting={isSubmitting}
            submitLabel="保存"
            cancelLabel="キャンセル"
          />
        ))}
    </Dialog>
  );
};

const StaffEditModalLoading = () => {
  return (
    <VStack align="stretch" gap={6}>
      {/* ヘッダー */}
      <Flex align="center" gap={4}>
        <Skeleton height="64px" width="64px" borderRadius="full" />
        <Box>
          <Skeleton height="28px" width="150px" mb={2} />
          <Skeleton height="16px" width="100px" />
        </Box>
      </Flex>

      {/* 基本情報カード */}
      <Box>
        <VStack align="stretch" gap={4}>
          <Skeleton height="40px" />
          <Skeleton height="40px" />
          <Skeleton height="40px" />
        </VStack>
      </Box>

      {/* スキルカード */}
      <Box>
        <Skeleton height="24px" width="60px" mb={4} />
        <VStack align="stretch" gap={4}>
          <Skeleton height="40px" />
          <Skeleton height="40px" />
          <Skeleton height="40px" />
        </VStack>
      </Box>

      {/* メモカード */}
      <Box>
        <Skeleton height="24px" width="50px" mb={4} />
        <VStack align="stretch" gap={4}>
          <Skeleton height="80px" />
        </VStack>
      </Box>

      {/* ボタン */}
      <Flex justify="flex-end" gap={3}>
        <Skeleton height="40px" width="80px" />
        <Skeleton height="40px" width="80px" />
      </Flex>
    </VStack>
  );
};

import { Box, Flex, Skeleton, Text, VStack } from "@chakra-ui/react";
import { useMutation, useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffEditForm } from "@/src/components/features/Staff/StaffEditForm";
import type { StaffEditFormValues } from "@/src/components/features/Staff/StaffEditForm/schema";
import { Dialog } from "@/src/components/ui/Dialog";
import { toaster } from "@/src/components/ui/toaster";
import { SKILL_LEVELS } from "@/src/constants/validations";
import { userAtom } from "@/src/stores/user";

type StaffEditModalProps = {
  staffId: string;
  shopId: string;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  onSave?: () => void;
};

export const StaffEditModal = ({ staffId, shopId, isOpen, onOpenChange, onClose, onSave }: StaffEditModalProps) => {
  const user = useAtomValue(userAtom);
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

  const updateStaffInfo = useMutation(api.shop.mutations.updateStaffInfo);

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
        maxWeeklyHours: typeof data.maxWeeklyHours === "number" ? data.maxWeeklyHours : null,
        memo: data.memo ?? "",
        workStyleNote: data.workStyleNote ?? "",
        hourlyWage: typeof data.hourlyWage === "number" ? data.hourlyWage : null,
      });

      toaster.success({
        title: "スタッフ情報を更新しました",
      });

      onSave?.();
      onClose();
    } catch (error) {
      toaster.error({
        title: "スタッフ情報の更新に失敗しました",
        description: error instanceof Error ? error.message : "エラーが発生しました",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      title={staff ? `${staff.displayName} の編集` : "スタッフ編集"}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={onClose}
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

      {!isLoading && !hasError && staff && positions && staffSkills && (
        <StaffEditForm
          staff={staff}
          positions={positions}
          staffSkills={staffSkills}
          onSubmit={handleSubmit}
          onCancel={onClose}
          isSubmitting={isSubmitting}
          submitLabel="保存"
          cancelLabel="閉じる"
        />
      )}
    </Dialog>
  );
};

const StaffEditModalLoading = () => {
  return (
    <VStack align="stretch" gap={6}>
      {/* 基本情報カード */}
      <Box>
        <Skeleton height="24px" width="80px" mb={4} />
        <VStack align="stretch" gap={4}>
          <Skeleton height="40px" />
          <Skeleton height="40px" />
          <Skeleton height="40px" />
          <Skeleton height="40px" />
        </VStack>
      </Box>

      {/* スキルカード */}
      <Box>
        <Skeleton height="24px" width="60px" mb={4} />
        <VStack align="stretch" gap={4}>
          <Skeleton height="60px" />
          <Skeleton height="60px" />
          <Skeleton height="60px" />
        </VStack>
      </Box>

      {/* メモカード */}
      <Box>
        <Skeleton height="24px" width="50px" mb={4} />
        <VStack align="stretch" gap={4}>
          <Skeleton height="80px" />
          <Skeleton height="80px" />
        </VStack>
      </Box>

      {/* ボタン */}
      <Flex justify="flex-end" gap={3}>
        <Skeleton height="40px" width="100px" />
        <Skeleton height="40px" width="100px" />
      </Flex>
    </VStack>
  );
};

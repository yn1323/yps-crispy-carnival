import { Stack, Text } from "@chakra-ui/react";
import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RegularClosedDay } from "@/convex/shop/schemas";
import { type CreateRecruitmentData, CreateRecruitmentForm } from "@/src/components/features/CreateRecruitmentForm";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { RecruitmentChangedNotice } from "@/src/components/shared/RecruitmentChangedNotice";
import { Button } from "@/src/components/ui/Button";
import { StepperDialog } from "@/src/components/ui/StepperDialog";
import { addDays } from "@/src/domains/shift/date";
import { useDeadlineActive } from "@/src/hooks/useDeadlineActive";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { getConvexErrorCode } from "@/src/lib/convex/error";

type EditableRecruitment = CreateRecruitmentData & {
  _id: Id<"recruitments">;
  editVersion?: number;
  status: "open" | "confirmed";
};

type Props = {
  recruitment: EditableRecruitment | null;
  shop: { shopId: string; shopName: string; regularClosedDays: RegularClosedDay[] };
  expectedOrganizationId: string;
  onClose: () => void;
};

// The parent mounts one dialog per editing session; reactive updates must not replace its initial values.
export function EditRecruitmentDialog({ recruitment, shop, expectedOrganizationId, onClose }: Props) {
  const initial = useRef(recruitment).current;
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const updateRecruitment = useMutation(api.recruitment.mutations.updateRecruitment);
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);
  const [hasStaleError, setHasStaleError] = useState(false);
  const isBeforeDeadline = useDeadlineActive(
    recruitment ? Date.parse(`${addDays(recruitment.deadline, 1)}T00:00:00+09:00`) : null,
  );
  const isBeforeStart = useDeadlineActive(recruitment ? Date.parse(`${recruitment.periodStart}T00:00:00+09:00`) : null);
  const isStale = hasStaleError || (initial?.editVersion ?? 0) !== (recruitment?.editVersion ?? 0);
  const isEditable = recruitment?.status === "open" && isBeforeDeadline && isBeforeStart;
  const { run: handleSubmit, isRunning } = useSingleFlight(async (data: CreateRecruitmentData) => {
    if (!initial || !isEditable || isStale) return;
    try {
      const result = await updateRecruitment({
        ...data,
        recruitmentId: initial._id,
        expectedEditVersion: initial.editVersion ?? 0,
        shopId: shop.shopId as Id<"shops">,
        expectedOrganizationId: expectedOrganizationId as Id<"organizations">,
      });
      if (!isMountedRef.current) return;
      onClose();
      showSuccessToast({ title: result.changed ? "シフト募集を変更しました" : "変更はありません" });
    } catch (error) {
      if (!isMountedRef.current) return;
      if (getConvexErrorCode(error) === "RECRUITMENT_CHANGED") setHasStaleError(true);
      else showErrorToast(error);
    }
  });

  return (
    <StepperDialog
      title="シフト募集を編集"
      isOpen
      onClose={onClose}
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      preventClose={isRunning || isFormSubmitting}
    >
      {isStale ? (
        <RecruitmentChangedNotice onReload={() => window.location.reload()} />
      ) : !isEditable || !initial ? (
        <Stack gap={4} p={6}>
          <Text>この募集は編集できません。未確定・シフト開始前・提出期限前の募集を編集できます。</Text>
          <Button variant="outline" alignSelf="flex-start" onClick={onClose}>
            閉じる
          </Button>
        </Stack>
      ) : (
        <CreateRecruitmentForm
          mode="edit"
          defaultValues={initial}
          regularClosedDays={shop.regularClosedDays}
          shopTarget={{ mode: "fixed", shop }}
          onSubmit={handleSubmit}
          onCancel={onClose}
          onSubmittingChange={setIsFormSubmitting}
        />
      )}
    </StepperDialog>
  );
}

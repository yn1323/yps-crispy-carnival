import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { UserShopDetailMembership } from "./types";

export function useUserShopMembershipActions({
  targetShopId,
  membership,
  isReadOnly,
}: {
  targetShopId: Id<"shops">;
  membership: UserShopDetailMembership;
  isReadOnly: boolean;
}) {
  const [optimisticShiftExclusion, setOptimisticShiftExclusion] = useState<{
    targetShopId: Id<"shops">;
    staffId: Id<"staffs">;
    excluded: boolean;
  } | null>(null);
  const [shiftTargetCooldown, setShiftTargetCooldown] = useState<{
    targetShopId: Id<"shops">;
    staffId: Id<"staffs">;
  } | null>(null);
  const shiftTargetCooldownTimerRef = useRef<{
    targetShopId: Id<"shops">;
    staffId: Id<"staffs">;
    timerId: number;
  } | null>(null);
  const currentTargetRef = useRef({ targetShopId, staffId: membership.staffId, isReadOnly });
  currentTargetRef.current = { targetShopId, staffId: membership.staffId, isReadOnly };
  const setShiftExclusion = useMutation(api.staff.mutations.setShiftExclusion);

  useEffect(() => {
    setOptimisticShiftExclusion((current) => {
      if (!current) return current;
      if (
        current.targetShopId !== targetShopId ||
        current.staffId !== membership.staffId ||
        current.excluded === membership.excludedFromShift
      ) {
        return null;
      }
      return current;
    });
  }, [membership.excludedFromShift, membership.staffId, targetShopId]);

  useEffect(() => {
    return () => {
      if (shiftTargetCooldownTimerRef.current) {
        window.clearTimeout(shiftTargetCooldownTimerRef.current.timerId);
        shiftTargetCooldownTimerRef.current = null;
      }
    };
  }, []);

  const hasOptimisticShiftExclusion =
    optimisticShiftExclusion?.targetShopId === targetShopId && optimisticShiftExclusion.staffId === membership.staffId;
  const excludedFromShift = hasOptimisticShiftExclusion
    ? optimisticShiftExclusion.excluded
    : membership.excludedFromShift;
  const isShiftTargetCoolingDown =
    shiftTargetCooldown?.targetShopId === targetShopId && shiftTargetCooldown.staffId === membership.staffId;

  const { run: changeShiftTarget, isRunning: isChangingShiftTarget } = useSingleFlight(
    async (isShiftTarget: boolean) => {
      const target = currentTargetRef.current;
      const currentCooldown = shiftTargetCooldownTimerRef.current;
      if (
        (currentCooldown?.targetShopId === target.targetShopId && currentCooldown.staffId === target.staffId) ||
        target.isReadOnly ||
        membership.shopId !== target.targetShopId ||
        membership.staffId !== target.staffId
      )
        return;
      if (currentCooldown) window.clearTimeout(currentCooldown.timerId);
      const cooldownTarget = { targetShopId: target.targetShopId, staffId: target.staffId };
      setShiftTargetCooldown(cooldownTarget);
      const timerId = window.setTimeout(() => {
        const latestCooldown = shiftTargetCooldownTimerRef.current;
        if (
          latestCooldown?.targetShopId !== cooldownTarget.targetShopId ||
          latestCooldown.staffId !== cooldownTarget.staffId
        ) {
          return;
        }
        shiftTargetCooldownTimerRef.current = null;
        setShiftTargetCooldown((current) =>
          current?.targetShopId === cooldownTarget.targetShopId && current.staffId === cooldownTarget.staffId
            ? null
            : current,
        );
      }, 1000);
      shiftTargetCooldownTimerRef.current = { ...cooldownTarget, timerId };
      const excluded = !isShiftTarget;
      setOptimisticShiftExclusion({ targetShopId: target.targetShopId, staffId: target.staffId, excluded });
      try {
        await setShiftExclusion({ shopId: target.targetShopId, staffId: target.staffId, excluded });
        const current = currentTargetRef.current;
        if (current.targetShopId === target.targetShopId && current.staffId === target.staffId) {
          showSuccessToast({ title: excluded ? "シフト対象外にしました" : "シフト対象に戻しました" });
        }
      } catch (error) {
        const current = currentTargetRef.current;
        if (current.targetShopId === target.targetShopId && current.staffId === target.staffId) {
          setOptimisticShiftExclusion((optimistic) =>
            optimistic?.targetShopId === target.targetShopId && optimistic.staffId === target.staffId
              ? null
              : optimistic,
          );
          showErrorToast(error);
        }
      }
    },
  );

  return {
    excludedFromShift,
    isChangingShiftTarget: isChangingShiftTarget || isShiftTargetCoolingDown,
    onChangeShiftTarget: changeShiftTarget,
  };
}

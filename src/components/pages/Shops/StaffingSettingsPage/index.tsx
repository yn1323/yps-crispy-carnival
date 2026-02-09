import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffingRequirement } from "@/src/components/features/Shift/StaffingRequirement";
import { SetupWizard } from "@/src/components/features/Shift/StaffingRequirement/SetupWizard";
import type { AIInput, PatternType, StaffingEntry } from "@/src/components/features/Shift/StaffingRequirement/types";
import { LazyShow } from "@/src/components/ui/LazyShow";
import { LoadingState } from "@/src/components/ui/LoadingState";
import { toaster } from "@/src/components/ui/toaster";

type Props = {
  shopId: string;
};

export const StaffingSettingsPage = ({ shopId }: Props) => {
  const shop = useQuery(api.shop.queries.getById, { shopId: shopId as Id<"shops"> });
  const positions = useQuery(api.position.queries.listByShop, { shopId: shopId as Id<"shops"> });
  // TODO: pnpm convex:dev 実行後に以下を有効化
  // const requiredStaffing = useQuery(api.requiredStaffing.queries.getByShopId, { shopId: shopId as Id<"shops"> });
  const requiredStaffing: never[] = []; // 一時的にモック

  // Mutations
  const upsertMutation = useMutation(api.requiredStaffing.mutations.upsert);
  const copyMutation = useMutation(api.requiredStaffing.mutations.copyToMultipleDays);
  const saveAllMutation = useMutation(api.requiredStaffing.mutations.saveAll);

  // UI状態
  const [isSaving, setIsSaving] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  // requiredStaffingをフラット化（StaffingRequirement用）
  // TODO: requiredStaffingクエリ有効化後、依存配列にrequiredStaffingを追加
  const flattenedStaffing = useMemo(() => {
    if (!requiredStaffing) return [];
    return requiredStaffing.flatMap(
      (dayRecord: { _id: string; shopId: string; dayOfWeek: number; staffing: StaffingEntry[] }) =>
        dayRecord.staffing.map((entry) => ({
          _id: dayRecord._id,
          shopId: dayRecord.shopId,
          dayOfWeek: dayRecord.dayOfWeek,
          hour: entry.hour,
          position: entry.position,
          requiredCount: entry.requiredCount,
        })),
    );
  }, []);

  // データ未設定かどうか
  const hasNoData = requiredStaffing !== undefined && requiredStaffing.length === 0;

  // 保存処理（曜日単位）
  const handleSave = useCallback(
    async (params: { dayOfWeek: number; staffing: StaffingEntry[]; aiInput?: AIInput }) => {
      setIsSaving(true);
      try {
        await upsertMutation({
          shopId: shopId as Id<"shops">,
          dayOfWeek: params.dayOfWeek,
          staffing: params.staffing,
          aiInput: params.aiInput,
        });
        toaster.create({
          description: "必要人員設定を保存しました",
          type: "success",
        });
      } catch (error) {
        toaster.create({
          description: "保存に失敗しました",
          type: "error",
        });
        console.error("保存エラー:", error);
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    [shopId, upsertMutation],
  );

  // コピー処理
  const handleCopy = useCallback(
    async (params: { sourceDayOfWeek: number; targetDaysOfWeek: number[] }) => {
      setIsCopying(true);
      try {
        await copyMutation({
          shopId: shopId as Id<"shops">,
          sourceDayOfWeek: params.sourceDayOfWeek,
          targetDaysOfWeek: params.targetDaysOfWeek,
        });
        toaster.create({
          description: "設定をコピーしました",
          type: "success",
        });
      } catch (error) {
        toaster.create({
          description: "コピーに失敗しました",
          type: "error",
        });
        console.error("コピーエラー:", error);
        throw error;
      } finally {
        setIsCopying(false);
      }
    },
    [shopId, copyMutation],
  );

  // SetupWizard保存処理（全曜日一括）
  const handleWizardSave = useCallback(
    async (patterns: PatternType[], aiInput?: AIInput) => {
      setIsSaving(true);
      try {
        const settings = patterns.flatMap((pattern) =>
          pattern.appliedDays.map((dayOfWeek) => ({
            dayOfWeek,
            staffing: pattern.staffing,
          })),
        );

        await saveAllMutation({
          shopId: shopId as Id<"shops">,
          settings,
          aiInput,
        });

        setShowWizard(false);
        toaster.create({
          description: "初期設定を保存しました",
          type: "success",
        });
      } catch (error) {
        toaster.create({
          description: "保存に失敗しました",
          type: "error",
        });
        console.error("初期設定保存エラー:", error);
      } finally {
        setIsSaving(false);
      }
    },
    [shopId, saveAllMutation],
  );

  // ローディング
  if (shop === undefined || positions === undefined) {
    return (
      <LazyShow>
        <LoadingState />
      </LazyShow>
    );
  }

  // 店舗が見つからない場合
  if (shop === null) {
    return null;
  }

  const shopData = {
    _id: shop._id,
    shopName: shop.shopName,
    openTime: shop.openTime,
    closeTime: shop.closeTime,
  };

  const positionData = positions.map((p) => ({ _id: p._id, name: p.name }));

  // SetupWizard表示（初回 or やり直し）
  if (hasNoData || showWizard) {
    return (
      <SetupWizard
        openTime={shop.openTime}
        closeTime={shop.closeTime}
        positions={positionData}
        onSave={handleWizardSave}
        onCancel={() => setShowWizard(false)}
      />
    );
  }

  return (
    <StaffingRequirement
      shopId={shopId}
      shop={shopData}
      positions={positionData}
      initialStaffing={flattenedStaffing}
      onSave={handleSave}
      onCopy={handleCopy}
      onResetSetup={() => setShowWizard(true)}
      isSaving={isSaving}
      isCopying={isCopying}
    />
  );
};

import { useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffingMatrix } from "@/src/components/features/Shift/StaffingMatrix";
import { LazyShow } from "@/src/components/ui/LazyShow";
import { LoadingState } from "@/src/components/ui/LoadingState";
import { toaster } from "@/src/components/ui/toaster";

type Props = {
  shopId: string;
};

type StaffingItem = {
  hour: number;
  position: string;
  requiredCount: number;
};

type AIInput = {
  shopType: string;
  customerCount: string;
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

  // ローディング状態
  const [isSaving, setIsSaving] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  // 保存処理
  const handleSave = useCallback(
    async (params: { dayOfWeek: number; staffing: StaffingItem[]; aiInput?: AIInput }) => {
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

  return (
    <StaffingMatrix
      shopId={shopId}
      shop={{
        _id: shop._id,
        shopName: shop.shopName,
        openTime: shop.openTime,
        closeTime: shop.closeTime,
      }}
      positions={positions.map((p) => ({ _id: p._id, name: p.name }))}
      initialStaffing={requiredStaffing}
      onSave={handleSave}
      onCopy={handleCopy}
      isSaving={isSaving}
      isCopying={isCopying}
    />
  );
};

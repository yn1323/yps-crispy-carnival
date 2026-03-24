import { useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PeakBandSettings } from "@/src/components/features/Shift/PeakBandSettings";
import { LazyShow } from "@/src/components/ui/LazyShow";
import { LoadingState } from "@/src/components/ui/LoadingState";
import { toaster } from "@/src/components/ui/toaster";

type Props = {
  shopId: string;
};

export const StaffingSettingsPage = ({ shopId }: Props) => {
  const shop = useQuery(api.shop.queries.getById, { shopId: shopId as Id<"shops"> });

  // Mutations
  const upsertPeakBandsMutation = useMutation(api.requiredStaffing.mutations.upsertPeakBands);

  // UI状態
  const [isSaving, setIsSaving] = useState(false);

  // 保存処理
  const handleSave = useCallback(
    async (params: {
      dayOfWeek: number;
      peakBands: { name: string; startTime: string; endTime: string; requiredCount: number }[];
      minimumStaff: number;
    }) => {
      setIsSaving(true);
      try {
        await upsertPeakBandsMutation({
          shopId: shopId as Id<"shops">,
          dayOfWeek: params.dayOfWeek,
          peakBands: params.peakBands,
          minimumStaff: params.minimumStaff,
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
    [shopId, upsertPeakBandsMutation],
  );

  // ローディング
  if (shop === undefined) {
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

  return <PeakBandSettings shopId={shopId} shopName={shop.shopName} onSave={handleSave} isSaving={isSaving} />;
};

import { useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { InitialDayData } from "@/src/components/features/Shift/PeakBandSettings";
import { PeakBandSettings } from "@/src/components/features/Shift/PeakBandSettings";
import { LazyShow } from "@/src/components/ui/LazyShow";
import { LoadingState } from "@/src/components/ui/LoadingState";
import { toaster } from "@/src/components/ui/toaster";

type Props = {
  shopId: string;
};

export const StaffingSettingsPage = ({ shopId }: Props) => {
  const shop = useQuery(api.shop.queries.getById, { shopId: shopId as Id<"shops"> });
  const staffingData = useQuery(api.requiredStaffing.queries.getByShopId, { shopId: shopId as Id<"shops"> });

  // Mutations
  const upsertPeakBandsMutation = useMutation(api.requiredStaffing.mutations.upsertPeakBands);

  // UI状態
  const [isSaving, setIsSaving] = useState(false);

  // 保存処理（複数曜日対応）
  const handleSave = useCallback(
    async (params: {
      dayOfWeeks: readonly number[];
      peakBands: { startTime: string; endTime: string; requiredCount: number }[];
      minimumStaff: number;
    }) => {
      setIsSaving(true);
      try {
        // 全dayOfWeekに同じ設定を保存
        await Promise.all(
          params.dayOfWeeks.map((dayOfWeek) =>
            upsertPeakBandsMutation({
              shopId: shopId as Id<"shops">,
              dayOfWeek,
              peakBands: params.peakBands,
              minimumStaff: params.minimumStaff,
            }),
          ),
        );
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
  if (shop === undefined || staffingData === undefined) {
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

  // 初期データを変換
  const initialData: InitialDayData[] = (staffingData ?? []).map((s) => ({
    dayOfWeek: s.dayOfWeek,
    peakBands: s.peakBands,
    minimumStaff: s.minimumStaff,
  }));

  return (
    <PeakBandSettings
      shopId={shopId}
      shopName={shop.shopName}
      initialData={initialData}
      onSave={handleSave}
      isSaving={isSaving}
    />
  );
};

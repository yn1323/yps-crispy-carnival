import type { EventCountDto, ServiceSnapshotDto } from "@/api/analyticsTypes";
import { metricLabel } from "./metrics";

export type ChartDatum = Record<string, number | string | null>;

export function serviceSnapshotLineSeries(snapshots: ServiceSnapshotDto[]) {
  return snapshots.map((snapshot) => ({
    date: snapshot.date,
    店舗数: snapshot.shopCount,
    スタッフ数: snapshot.staffCount,
    募集中: snapshot.openRecruitmentCount,
  }));
}

export function eventLineSeries(points: EventCountDto[], metrics: readonly string[]) {
  const byDate = new Map<string, ChartDatum>();
  for (const point of points) {
    const datum = byDate.get(point.date) ?? { date: point.date };
    datum[metricLabel(point.metric)] = point.count;
    byDate.set(point.date, datum);
  }
  return [...byDate.values()]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((datum) => {
      for (const metric of metrics) {
        const label = metricLabel(metric);
        if (!(label in datum)) datum[label] = 0;
      }
      return datum;
    });
}

export function shopRankingBarSeries<T extends { shopName: string; value: number }>(rows: T[]) {
  return rows.map((row) => ({ 店舗: row.shopName, value: row.value }));
}

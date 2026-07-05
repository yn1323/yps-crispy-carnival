const numberFormatter = new Intl.NumberFormat("ja-JP");
const percentFormatter = new Intl.NumberFormat("ja-JP", {
  maximumFractionDigits: 1,
  style: "percent",
});

export function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return numberFormatter.format(value);
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return percentFormatter.format(value);
}

export function formatDateTime(value: number | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

export function formatLeadTimeMs(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  const days = value / (24 * 60 * 60 * 1000);
  if (days >= 1) return `${days.toFixed(1)}日`;
  const hours = value / (60 * 60 * 1000);
  return `${hours.toFixed(1)}時間`;
}

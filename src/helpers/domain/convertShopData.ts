// シフト提出頻度の変換
export const convertSubmitFrequency = {
  toLabel: (freq: string): string => {
    if (freq === "1w") return "週1回";
    if (freq === "2w") return "2週間ごと";
    if (freq === "1m") return "1ヶ月ごと";
    return freq;
  },
  toValue: (label: string): string => {
    if (label === "週1回") return "1w";
    if (label === "2週間ごと") return "2w";
    if (label === "1ヶ月ごと") return "1m";
    return label;
  },
};

// シフト時間単位の変換
export const convertTimeUnit = {
  toLabel: (unit: number): string => {
    if (unit === 15) return "15分";
    if (unit === 30) return "30分";
    if (unit === 60) return "1時間";
    return `${unit}分`;
  },
  toValue: (label: string): number => {
    if (label === "15分") return 15;
    if (label === "30分") return 30;
    if (label === "1時間") return 60;
    const match = label.match(/^(\d+)分$/);
    return match ? Number.parseInt(match[1], 10) : 0;
  },
};

// ロール（役割）の変換
export const convertRole = {
  toLabel: (role: string): string => {
    if (role === "owner") return "オーナー";
    if (role === "manager") return "マネージャー";
    if (role === "general") return "一般";
    return role;
  },
  toValue: (label: string): string => {
    if (label === "オーナー") return "owner";
    if (label === "マネージャー") return "manager";
    if (label === "一般") return "general";
    return label;
  },
  toBadgeColor: (role: string): string => {
    if (role === "owner") return "purple";
    if (role === "manager") return "teal";
    return "gray";
  },
};

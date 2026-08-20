import type { IconType } from "react-icons";
import { LuCalendarDays, LuHouse, LuMessageCircle, LuSettings, LuUsersRound } from "react-icons/lu";

export type AppNavigationKey = "home" | "shifts" | "staff" | "actions" | "manage";

export type AppNavigationHref = "/dashboard" | "/shifts" | "/staff" | "/actions" | "/manage";

export type AppPrimaryNavigationItem = {
  key: AppNavigationKey;
  label: string;
  href: AppNavigationHref;
  icon: IconType;
  badge?: {
    label: string;
    value: number;
  };
};

export const APP_PRIMARY_NAVIGATION_ITEMS: readonly AppPrimaryNavigationItem[] = [
  { key: "home", label: "ホーム", href: "/dashboard", icon: LuHouse },
  { key: "shifts", label: "シフト", href: "/shifts", icon: LuCalendarDays },
  { key: "staff", label: "スタッフ", href: "/staff", icon: LuUsersRound },
  { key: "actions", label: "要対応", href: "/actions", icon: LuMessageCircle },
  { key: "manage", label: "管理", href: "/manage", icon: LuSettings },
];

import { atom } from "jotai";
import {
  CLOSED_FEATURE_VISIBILITY,
  type FeatureVisibility,
  normalizeFeatureVisibility,
} from "@/src/domains/featureVisibility";

export type AuthenticatedUser = {
  authId: string;
  name: string;
  email: string;
  // TODO[narrow]: feature visibility対応backendの全deployment反映と旧atom互換期間終了後にrequired化する。
  // 既存のStoryや永続化済みatomとの互換期間中は欠損し得る。派生atom側で必ず閉じる。
  featureVisibility?: FeatureVisibility;
};

export const EMPTY_USER: AuthenticatedUser = {
  authId: "",
  name: "",
  email: "",
  featureVisibility: CLOSED_FEATURE_VISIBILITY,
};

export const userAtom = atom<AuthenticatedUser>(EMPTY_USER);

export const featureVisibilityAtom = atom((get) => normalizeFeatureVisibility(get(userAtom).featureVisibility));

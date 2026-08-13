import { atom } from "jotai";
import {
  AVAILABLE_FEATURE_VISIBILITY,
  type FeatureVisibility,
  normalizeFeatureVisibility,
} from "@/src/domains/featureVisibility";

export type AuthenticatedUser = {
  authId: string;
  name: string;
  email: string;
  // 既存のStoryや永続化済みatomとの形状互換のためoptionalを維持する。
  featureVisibility?: FeatureVisibility;
};

export const EMPTY_USER: AuthenticatedUser = {
  authId: "",
  name: "",
  email: "",
  featureVisibility: AVAILABLE_FEATURE_VISIBILITY,
};

export const userAtom = atom<AuthenticatedUser>(EMPTY_USER);

export const featureVisibilityAtom = atom((get) => normalizeFeatureVisibility(get(userAtom).featureVisibility));

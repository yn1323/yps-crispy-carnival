import { ConvexError } from "convex/values";
import { getReleaseFeatureVisibility, type ReleaseFeatureVisibility } from "./config";

export type ReleaseFeature = keyof ReleaseFeatureVisibility;

export const RELEASE_FEATURE_DISABLED_MESSAGE = "この機能は現在利用できません。";

export function isReleaseFeatureEnabled(feature: ReleaseFeature): boolean {
  return getReleaseFeatureVisibility()[feature];
}

/** public操作がDBや外部providerへ到達する前に、未リリース機能を閉じる。 */
export function requireReleaseFeature(feature: ReleaseFeature): void {
  if (!isReleaseFeatureEnabled(feature)) throw new ConvexError(RELEASE_FEATURE_DISABLED_MESSAGE);
}

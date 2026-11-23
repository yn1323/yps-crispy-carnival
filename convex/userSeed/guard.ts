import { isDebugModeEnabled } from "../_lib/config";

/** Shiftori Productionのdeployment名。DEBUG_MODEの設定にかかわらず、この実行先では動かさない。 */
export const USER_SEED_PRODUCTION_DEPLOYMENT_NAME = "proficient-kookabura-834";

/**
 * ユーザー単位の確認用データ投入を許す実行先かを確かめる。
 * internal functionもCLIから誤った実行先へ呼ばれ得るため、各entrypointで毎回確かめる。
 */
export function assertUserSeedEnabled(): void {
  const deploymentUrl = (process.env.CONVEX_CLOUD_URL ?? "").trim();
  if (deploymentUrl.includes(USER_SEED_PRODUCTION_DEPLOYMENT_NAME)) {
    throw new Error("User seed is not available on production");
  }
  if (!isDebugModeEnabled()) {
    throw new Error("User seed requires DEBUG_MODE=true");
  }
}

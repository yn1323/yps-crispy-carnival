/**
 * ダークローンチ中に公開している導線を、E2Eの前提条件として読む。
 *
 * `playwright.config.ts`が`dotenv.config()`で読み込む`.env`は、
 * `pnpm convex:env:setup`がConvex deploymentへ同期する値と同じものである。
 * どちらか一方だけを変えた場合は、前提条件と実際の画面がずれてテストが落ちる。
 */
function isFeatureEnabled(value: string | undefined): boolean {
  return (value ?? "").trim() === "enabled";
}

export const isOrganizationCreationEnabled = () => isFeatureEnabled(process.env.FEATURE_ORGANIZATION_CREATION);
export const isShopAdditionEnabled = () => isFeatureEnabled(process.env.FEATURE_SHOP_ADDITION);
export const isBillingEnabled = () => isFeatureEnabled(process.env.FEATURE_BILLING);
export const isManagerInvitationEnabled = () => isFeatureEnabled(process.env.FEATURE_MANAGER_INVITATION);

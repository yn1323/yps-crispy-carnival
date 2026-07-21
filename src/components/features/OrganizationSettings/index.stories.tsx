import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { OrganizationSettingsView } from ".";
import type { OrganizationContextModel } from "./OrganizationContext/script";
import type { OrganizationBillingView, OrganizationSettingsViewProps } from "./types";

const actions = {
  onSelectOrganization: fn(),
  onUpdateOrganizationName: fn(),
  onInviteManager: fn(),
  onOpenUser: fn(),
  onAddShop: fn(),
  onOpenShop: fn(),
  onManagePlan: fn(),
  onRetryPlanPrice: fn(),
  onUpdatePaymentMethod: fn(),
  onUpdateBillingEmail: fn(),
  onOpenBillingDocuments: fn(),
  onDeleteOrganization: fn(),
};

const organizationContext: OrganizationContextModel = {
  options: [
    {
      key: "organization-sakura",
      organizationName: "株式会社さくらダイニング",
      shopId: "shop-shibuya",
      isSelected: true,
    },
  ],
  selectedOrganizationName: "株式会社さくらダイニング",
  selectedShopId: "shop-shibuya",
  selectedShopName: "渋谷店",
  canSwitchOrganization: false,
};

const baseBilling: OrganizationBillingView = {
  state: "pro",
  currentPlan: "pro",
  isComplimentary: false,
  hasTrialContinuation: false,
  stripeBillingAvailable: true,
  hasStripeCustomer: true,
  peopleUsage: { current: 8, max: 20 },
  shopUsage: { current: 2, max: 5 },
  managerUsage: { current: 1, max: 5 },
  nextEvent: { label: "次回更新日", date: "2026年8月31日" },
  billingEmail: "billing@sakura.example.com",
  canManagePlan: true,
  canUpdatePaymentMethod: true,
  canUpdateBillingEmail: true,
  canScheduleFree: true,
};

const baseArgs: OrganizationSettingsViewProps = {
  organizationContext,
  organizationId: "organization-sakura",
  organizationUpdatedAt: 1_721_286_400_000,
  organizationName: "株式会社さくらダイニング",
  managerInvitations: [],
  canInviteManager: true,
  managerInvitationMode: "addition",
  freeManagerExchangeCandidates: [],
  canUpdateOrganizationName: true,
  people: [
    {
      id: "person-manager",
      name: "田中 太郎",
      email: "tanaka@sakura.example.com",
      managerRole: "active",
      isStaff: true,
      isLineConnected: true,
      shopNames: ["渋谷店", "新宿店"],
      shopIds: ["shop-shibuya", "shop-shinjuku"],
      canRemoveManagerRole: false,
      managerRoleRemovalDisabledReason: "最後の有効管理者の管理者権限は外せません。",
      canRemove: false,
      removeDisabledReason: "最後の有効管理者は削除できません。",
    },
    {
      id: "person-readonly",
      name: "佐藤 花子",
      email: "sato@sakura.example.com",
      managerRole: "readOnly",
      isStaff: false,
      shopNames: [],
      shopIds: [],
      canRemoveManagerRole: false,
      canRemove: true,
    },
    {
      id: "person-staff",
      name: "鈴木 次郎",
      email: "suzuki@sakura.example.com",
      managerRole: "none",
      isStaff: true,
      shopNames: ["渋谷店", "新宿店"],
      shopIds: ["shop-shibuya", "shop-shinjuku"],
      canRemoveManagerRole: false,
      canRemove: true,
    },
  ],
  shops: [
    {
      id: "shop-shibuya",
      name: "渋谷店",
      regularClosedDays: ["sun"],
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      staffCount: 8,
      canUpdateSettings: true,
      canDelete: true,
    },
    {
      id: "shop-shinjuku",
      name: "新宿店",
      regularClosedDays: [],
      submissionPattern: { kind: "dateOnly" },
      staffCount: 5,
      canUpdateSettings: true,
      canDelete: true,
    },
    {
      id: "shop-yokohama",
      name: "横浜店",
      regularClosedDays: ["mon", "thu"],
      submissionPattern: { kind: "time", startTime: "10:00", endTime: "23:00" },
      staffCount: 0,
      canUpdateSettings: true,
      canDelete: true,
    },
  ],
  billing: baseBilling,
  planPrices: {
    pro: {
      status: "available",
      value: { currency: "jpy", unitAmount: 3000, interval: "month", intervalCount: 1 },
    },
    business: {
      status: "available",
      value: { currency: "jpy", unitAmount: 6000, interval: "month", intervalCount: 1 },
    },
  },
  canAddShop: true,
  canDeleteOrganization: true,
  actions,
};

const billing = (overrides: Partial<OrganizationBillingView>): OrganizationBillingView => ({
  ...baseBilling,
  ...overrides,
});

const restrictedPeople = baseArgs.people.map((person) =>
  person.id === "person-manager"
    ? {
        ...person,
        canRemove: false,
        removeDisabledReason: "最後の復旧担当者は、引き継ぎまたは契約復旧まで削除できません。",
      }
    : person,
);

const disabledActionReasonArgs: Pick<
  OrganizationSettingsViewProps,
  | "people"
  | "shops"
  | "managerInvitations"
  | "canInviteManager"
  | "managerInvitationMode"
  | "freeManagerExchangeCandidates"
  | "inviteManagerDisabledReason"
  | "canUpdateOrganizationName"
  | "updateOrganizationNameDisabledReason"
  | "canAddShop"
  | "addShopDisabledReason"
  | "canDeleteOrganization"
  | "deleteOrganizationDisabledReason"
  | "billing"
> = {
  managerInvitations: [],
  canInviteManager: false,
  managerInvitationMode: "addition",
  freeManagerExchangeCandidates: [],
  inviteManagerDisabledReason: "閲覧のみの管理者は管理者を招待できません。",
  canUpdateOrganizationName: false,
  updateOrganizationNameDisabledReason: "閲覧のみの管理者はグループ名を変更できません。",
  canAddShop: false,
  addShopDisabledReason: "閲覧のみの管理者は店舗を追加できません。",
  canDeleteOrganization: false,
  deleteOrganizationDisabledReason: "閲覧のみの管理者はグループを削除できません。",
  billing: billing({
    state: "pendingActivation",
    currentPlan: null,
    targetPlan: "pro",
    canManagePlan: false,
    canUpdatePaymentMethod: false,
    canUpdateBillingEmail: false,
    canScheduleFree: false,
    managePlanDisabledReason: "閲覧のみの管理者はプランを変更できません。",
    paymentMethodDisabledReason: "閲覧のみの管理者はStripeの支払い情報を管理できません。",
    billingEmailDisabledReason: "閲覧のみの管理者は請求先を変更できません。",
  }),
  people: baseArgs.people,
  shops: baseArgs.shops.map((shop) => ({
    ...shop,
    canUpdateSettings: false,
    settingsDisabledReason: "閲覧のみの管理者は店舗設定を変更できません。",
  })),
};

const meta = {
  id: "features-organizationsettings",
  title: "Features/OrganizationSettings/1. 画面全体",
  component: OrganizationSettingsView,
  parameters: { layout: "padded" },
  args: baseArgs,
} satisfies Meta<typeof OrganizationSettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Users: Story = { name: "ユーザー｜通常" };

export const StaffWithoutShop: Story = {
  name: "ユーザー｜店舗未所属",
  args: {
    people: [
      ...baseArgs.people,
      {
        id: "person-without-shop",
        name: "店舗未所属スタッフ",
        email: "without-shop@sakura.example.com",
        managerRole: "none",
        isStaff: false,
        shopNames: [],
        shopIds: [],
        canRemoveManagerRole: false,
        canRemove: true,
      },
    ],
  },
};

export const UserListLoadMoreBehavior: Story = {
  name: "ユーザー｜もっと見る（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: {
    people: [
      ...baseArgs.people,
      ...Array.from({ length: 9 }, (_, index) => ({
        ...baseArgs.people[2],
        id: `person-extra-${index + 1}`,
        name: `追加ユーザー ${index + 1}`,
        email: `extra-${index + 1}@sakura.example.com`,
      })),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button", { name: "追加ユーザー 9のユーザー詳細を開く" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "もっと見る" }));
    await expect(canvas.getByRole("button", { name: "追加ユーザー 9のユーザー詳細を開く" })).toBeVisible();
  },
};

export const FutureAssignmentRemovalBlocked: Story = {
  name: "ユーザー｜未来のシフトあり",
  args: {
    people: baseArgs.people.map((person) =>
      person.id === "person-staff"
        ? {
            ...person,
            canRemove: false,
            removeDisabledReason: "将来のシフト割当を解除してから削除してください。",
          }
        : person,
    ),
  },
};

export const UserNavigationBehavior: Story = {
  name: "ユーザー｜詳細を開く（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: {
    actions: { ...actions, onOpenUser: fn() },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "鈴木 次郎のユーザー詳細を開く" }));
    await expect(args.actions.onOpenUser).toHaveBeenCalledTimes(1);
    await expect(args.actions.onOpenUser).toHaveBeenCalledWith("person-staff", 10);
  },
};

export const ManagerRoleRemoval: Story = {
  name: "ユーザー｜管理者権限を外す",
  args: {
    people: [
      {
        ...baseArgs.people[0],
        canRemoveManagerRole: true,
        managerRoleRemovalDisabledReason: undefined,
      },
      {
        id: "person-second-manager",
        name: "山田 美咲",
        email: "yamada@sakura.example.com",
        managerRole: "active",
        isStaff: true,
        shopNames: ["新宿店"],
        shopIds: ["shop-shinjuku"],
        canRemoveManagerRole: true,
        canRemove: true,
      },
      ...baseArgs.people.slice(1),
    ],
  },
};

export const Shops: Story = { name: "店舗｜通常", args: { defaultTab: "shops" } };

export const Settings: Story = { name: "設定｜通常", args: { defaultTab: "settings" } };

export const SettingsDeletionUnavailable: Story = {
  name: "設定｜削除不可",
  args: {
    defaultTab: "settings",
    canDeleteOrganization: false,
    deleteOrganizationDisabledReason: "有料契約やプラン変更を終了してからグループを削除してください。",
  },
  play: async ({ canvasElement }) => {
    const deleteButton = within(canvasElement).getByRole("button", { name: /^削除$/ });

    await expect(deleteButton).toBeDisabled();
    await expect(deleteButton).toHaveAccessibleDescription(
      "有料契約またはプラン変更の予約が残っています。「プランと支払い」で契約や予約を終了してから、グループを削除してください。",
    );
  },
};

export const SettingsDeletionUnavailableWithStripeSubscription: Story = {
  name: "設定｜Stripe契約が残るため削除不可",
  args: {
    defaultTab: "settings",
    canDeleteOrganization: false,
    deleteOrganizationDisabledReason: "Stripeの契約終了を確認してからグループを削除してください。",
  },
  play: async ({ canvasElement }) => {
    const deleteButton = within(canvasElement).getByRole("button", { name: /^削除$/ });

    await expect(deleteButton).toBeDisabled();
    await expect(deleteButton).toHaveAccessibleDescription(
      "有料契約またはプラン変更の予約が残っています。「プランと支払い」で契約や予約を終了してから、グループを削除してください。",
    );
  },
};

export const OrganizationDeletionActionBehavior: Story = {
  name: "設定｜グループ削除（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: {
    defaultTab: "settings",
    actions: { ...actions, onDeleteOrganization: fn() },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /^削除$/ }));
    await expect(args.actions.onDeleteOrganization).toHaveBeenCalledTimes(1);
  },
};

export const ShopRowBehavior: Story = {
  name: "店舗｜店舗詳細を開く（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: { defaultTab: "shops", actions: { ...actions, onOpenShop: fn() } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "渋谷店の店舗詳細を開く" }));
    await expect(args.actions.onOpenShop).toHaveBeenCalledWith("shop-shibuya");
  },
};

export const DisabledActionReasonsBehavior: Story = {
  name: "画面全体｜閲覧のみの操作制限（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: disabledActionReasonArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "管理者を招待" }),
      "閲覧のみの管理者は管理者を招待できません。",
    );
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "グループ名を変更" }),
      "閲覧のみの管理者はグループ名を変更できません。",
    );
    await userEvent.click(canvas.getByRole("tab", { name: "店舗" }));
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "店舗を追加" }),
      "閲覧のみの管理者は店舗を追加できません。",
    );
    await userEvent.click(canvas.getByRole("tab", { name: "プランと支払い" }));
    await expect(canvas.queryByRole("button", { name: /へ変更|変更予約を取り消す/ })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "支払い方法を見る" })).toBeDisabled();
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "請求先を変更" }),
      "閲覧のみの管理者は請求先を変更できません。",
    );
    await userEvent.click(canvas.getByRole("tab", { name: "設定" }));
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: /^削除$/ }),
      "閲覧のみの管理者はグループを削除できません。",
    );
  },
};

export const MobileDisabledActionReasonsBehavior: Story = {
  name: "画面全体｜閲覧のみの操作制限・モバイル（操作確認）",
  parameters: { screenshot: { skip: true } },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: disabledActionReasonArgs,
  play: DisabledActionReasonsBehavior.play,
};

export const Trial: Story = {
  name: "プランと支払い｜トライアル",
  args: {
    defaultTab: "billing",
    billing: billing({
      state: "trial",
      currentPlan: "trial",
      peopleUsage: { current: 12, max: 20 },
      shopUsage: { current: 3, max: 5 },
      trialEndsAt: Date.parse("2026-09-01T00:00:00+09:00"),
      nextEvent: { label: "トライアル最終日", date: "2026年8月31日" },
      hasStripeCustomer: false,
      canScheduleFree: false,
    }),
  },
};

export const TrialWithProContinuation: Story = {
  name: "プランと支払い｜トライアル・Pro継続登録済み",
  args: {
    defaultTab: "billing",
    billing: billing({
      state: "trial",
      currentPlan: "trial",
      hasTrialContinuation: true,
      targetPlan: "pro",
      peopleUsage: { current: 12, max: 20 },
      shopUsage: { current: 3, max: 5 },
      trialEndsAt: Date.parse("2026-09-01T00:00:00+09:00"),
      nextEvent: { label: "トライアル最終日", date: "2026年8月31日" },
      hasStripeCustomer: true,
      canScheduleFree: false,
    }),
  },
};

export const Free: Story = {
  name: "プランと支払い｜無料",
  args: {
    defaultTab: "billing",
    managerInvitations: [],
    canInviteManager: true,
    managerInvitationMode: "freeManagerExchange",
    freeManagerExchangeCandidates: [
      {
        id: "person-staff",
        name: "鈴木 次郎",
        email: "suzuki@sakura.example.com",
      },
    ],
    canAddShop: false,
    addShopDisabledReason: "無料では店舗を1件まで登録できます。",
    billing: billing({
      state: "free",
      currentPlan: "free",
      peopleUsage: { current: 5, max: 5 },
      shopUsage: { current: 1, max: 1 },
      managerUsage: { current: 1, max: 1 },
      nextEvent: undefined,
      hasStripeCustomer: false,
      canUpdatePaymentMethod: false,
      paymentMethodDisabledReason: "無料プランでは支払い情報の管理は不要です。有料プランの契約時にStripeで登録します。",
      canUpdateBillingEmail: true,
      canScheduleFree: false,
    }),
  },
};

export const FreeBillingCapabilitiesBehavior: Story = {
  name: "プランと支払い｜無料の操作権限（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: Free.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Proへ変更" })).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "Businessへ変更" })).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "支払い方法を見る" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "請求書・領収書を見る" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "請求先を変更" })).toBeEnabled();
  },
};

export const Pro: Story = { name: "プランと支払い｜Pro", args: { defaultTab: "billing" } };

export const ProStripePortalActionsBehavior: Story = {
  name: "プランと支払い｜Stripe Portal導線（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: {
    defaultTab: "billing",
    actions: {
      ...actions,
      onUpdatePaymentMethod: fn(),
      onOpenBillingDocuments: fn(),
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "支払い方法を見る" }));
    await userEvent.click(canvas.getByRole("button", { name: "請求書・領収書を見る" }));
    await expect(args.actions.onUpdatePaymentMethod).toHaveBeenCalledTimes(1);
    await expect(args.actions.onOpenBillingDocuments).toHaveBeenCalledTimes(1);
    await expect(canvas.queryByText("発行済みの請求書はありません。")).not.toBeInTheDocument();
  },
};

export const ComplimentaryBusiness: Story = {
  name: "プランと支払い｜支払い不要Business",
  args: {
    defaultTab: "billing",
    billing: billing({
      state: "business",
      currentPlan: "business",
      isComplimentary: true,
      peopleUsage: { current: 22, max: 40 },
      shopUsage: { current: 3, max: 5 },
      nextEvent: undefined,
      hasStripeCustomer: false,
      canManagePlan: false,
      canUpdatePaymentMethod: false,
      canUpdateBillingEmail: false,
      canScheduleFree: false,
    }),
  },
};

export const ShopCapacityReachedBehavior: Story = {
  name: "店舗｜登録上限（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: {
    defaultTab: "shops",
    canAddShop: false,
    addShopDisabledReason: "店舗はグループごとに5件まで登録できます。",
    billing: billing({
      state: "pro",
      currentPlan: "pro",
      peopleUsage: { current: 20, max: 20 },
      shopUsage: { current: 5, max: 5 },
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const addShopButton = canvas.getByRole("button", { name: "店舗を追加" });
    await expectDisabledActionDescription(addShopButton, "店舗はグループごとに5件まで登録できます。");
    await expect(canvas.queryByRole("link", { name: "利用上限について問い合わせる" })).not.toBeInTheDocument();
  },
};

export const InitialPaymentPending: Story = {
  name: "プランと支払い｜初回支払い確認中",
  args: {
    defaultTab: "billing",
    billing: billing({
      state: "initialPaymentPending",
      currentPlan: "pro",
      nextEvent: { label: "支払い結果", date: "確認中" },
      canManagePlan: false,
      canUpdatePaymentMethod: false,
      managePlanDisabledReason: "初回支払いの結果を確認中のため、プランを変更できません。",
      paymentMethodDisabledReason: "初回支払いの結果を確認中です。確定後にStripeで支払い情報を管理できます。",
      canScheduleFree: false,
    }),
  },
};

export const PendingActivationFreeFallback: Story = {
  name: "プランと支払い｜有料プラン反映待ち・無料継続",
  args: {
    defaultTab: "billing",
    managerInvitations: [],
    canInviteManager: true,
    managerInvitationMode: "freeManagerExchange",
    freeManagerExchangeCandidates: [
      {
        id: "person-staff",
        name: "鈴木 次郎",
        email: "suzuki@sakura.example.com",
      },
    ],
    canAddShop: false,
    addShopDisabledReason: "支払い結果が確定してから店舗を追加できます。",
    billing: billing({
      state: "pendingActivation",
      currentPlan: "free",
      targetPlan: "pro",
      peopleUsage: { current: 5, max: 5 },
      shopUsage: { current: 1, max: 1 },
      blockedReason: "有料プランの支払い結果を確認中です。無料の基本機能は引き続き利用できます。",
      nextEvent: { label: "支払い結果", date: "確認中" },
      canManagePlan: false,
      canUpdatePaymentMethod: false,
      canUpdateBillingEmail: true,
      canScheduleFree: false,
      managePlanDisabledReason: "支払い結果を確認中のため、別のプラン変更はできません。",
      paymentMethodDisabledReason: "支払い結果を確認中です。確定後にStripeで支払い情報を管理できます。",
    }),
  },
};

export const PendingActivationRestrictedRecovery: Story = {
  name: "プランと支払い｜有料プラン反映待ち・利用制限",
  args: {
    defaultTab: "billing",
    managerInvitations: [],
    canInviteManager: false,
    managerInvitationMode: "addition",
    freeManagerExchangeCandidates: [],
    inviteManagerDisabledReason: "契約制限中は管理者を招待できません。",
    canAddShop: false,
    addShopDisabledReason: "契約制限中は店舗を追加できません。",
    people: restrictedPeople,
    shops: baseArgs.shops,
    billing: billing({
      state: "pendingActivation",
      currentPlan: null,
      targetPlan: "pro",
      peopleUsage: { current: 7, max: 5 },
      shopUsage: { current: 2, max: 1 },
      managerUsage: { current: 2, max: 1 },
      limitPlan: "free",
      requiredReductions: { people: 2, shops: 1, managers: 1 },
      blockedReason: "無料の利用人数と店舗数を超えています。ユーザーまたは店舗を削除してから再確認してください。",
      nextEvent: { label: "支払い結果", date: "確認中" },
      canManagePlan: true,
      canUpdatePaymentMethod: true,
      canUpdateBillingEmail: true,
      canScheduleFree: false,
    }),
  },
};

export const MigrationPending: Story = {
  name: "プランと支払い｜設定移行中",
  args: {
    defaultTab: "billing",
    managerInvitations: [],
    canInviteManager: false,
    managerInvitationMode: "addition",
    freeManagerExchangeCandidates: [],
    inviteManagerDisabledReason: "グループ単位の設定を移行しています。完了までお待ちください。",
    canAddShop: false,
    addShopDisabledReason: "グループ単位のプラン設定を移行しています。完了までお待ちください。",
    billing: billing({
      state: "migrationPending",
      currentPlan: null,
      blockedReason: "グループ単位のプラン設定を移行しています。完了後に自動で利用状態を再確認します。",
      nextEvent: undefined,
      hasStripeCustomer: false,
      canManagePlan: false,
      canUpdatePaymentMethod: false,
      canUpdateBillingEmail: false,
      canScheduleFree: false,
      managePlanDisabledReason: "設定の移行が完了するまでお待ちください。",
      paymentMethodDisabledReason: "設定の移行が完了するまでお待ちください。",
      billingEmailDisabledReason: "設定の移行が完了するまでお待ちください。",
    }),
  },
};

export const Grace: Story = {
  name: "プランと支払い｜支払い猶予",
  args: {
    defaultTab: "billing",
    billing: billing({
      state: "grace",
      currentPlan: "pro",
      blockedReason: "支払い方法を更新しないまま期限を過ぎると、契約制限中へ移行します。",
      nextEvent: { label: "支払い猶予期限", date: "2026年8月14日 10:30" },
      canScheduleFree: false,
    }),
  },
};

export const Restricted: Story = {
  name: "プランと支払い｜契約制限",
  args: {
    defaultTab: "billing",
    managerInvitations: [],
    canInviteManager: false,
    managerInvitationMode: "addition",
    freeManagerExchangeCandidates: [],
    inviteManagerDisabledReason: "契約制限中は管理者を招待できません。",
    canAddShop: false,
    addShopDisabledReason: "契約制限中は店舗を追加できません。",
    people: restrictedPeople,
    shops: baseArgs.shops,
    billing: billing({
      state: "restricted",
      currentPlan: null,
      previousPlan: "pro",
      targetPlan: "free",
      limitPlan: "free",
      peopleUsage: { current: 7, max: 5 },
      shopUsage: { current: 2, max: 1 },
      managerUsage: { current: 2, max: 1 },
      requiredReductions: { people: 2, shops: 1, managers: 1 },
      blockedReason: "無料の利用人数と店舗数を超えています。ユーザーまたは店舗を削除してから再確認してください。",
      nextEvent: undefined,
      canScheduleFree: false,
    }),
  },
};

export const ScheduledFree: Story = {
  name: "プランと支払い｜無料へ変更予定",
  args: {
    defaultTab: "billing",
    billing: billing({
      state: "scheduledChange",
      currentPlan: "pro",
      targetPlan: "free",
      nextEvent: { label: "無料適用予定日", date: "2026年8月31日" },
      canScheduleFree: false,
    }),
  },
};

export const MobileRestricted: Story = {
  name: "プランと支払い｜契約制限・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: Restricted.args,
};

export const MobileComplimentaryBusiness: Story = {
  name: "プランと支払い｜支払い不要Business・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: ComplimentaryBusiness.args,
};

export const MobileUsers: Story = {
  name: "ユーザー｜通常・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: { defaultTab: "people" },
};

export const MobileShops: Story = {
  name: "店舗｜通常・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: { defaultTab: "shops" },
};

export const MobileSettings: Story = {
  name: "設定｜通常・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: { defaultTab: "settings" },
};

async function expectDisabledActionDescription(button: HTMLElement, expectedReason: string) {
  await expect(button).toBeDisabled();
  await expect(button).toHaveAccessibleDescription(expectedReason);
}

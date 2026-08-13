import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { OrganizationSettingsSkeleton, OrganizationSettingsView } from ".";
import type { OrganizationContextModel } from "./OrganizationContext/script";
import type { OrganizationBillingView, OrganizationSettingsViewProps } from "./types";

const actions = {
  onBackToDashboard: fn(),
  onSelectOrganization: fn(),
  onUpdateOrganizationName: fn(),
  onManageManagers: fn(),
  onOpenUser: fn(),
  onAddShop: fn(),
  onOpenShop: fn(),
  onManagePlan: fn(),
  onRetryPlanPrice: fn(),
  onUpdatePaymentMethod: fn(),
  onUpdateBillingEmail: fn(),
  onOpenBillingDocuments: fn(),
  onDeleteOrganization: fn(),
  onCreateOrganization: fn(),
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
  canCreateOrganization: true,
  // 店舗追加だけはcanonical LINE rollout gateと同期し、ほかの現行導線は公開する。
  features: { organizationCreation: true, shopAddition: true, billing: true, managerInvitation: true },
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
      removeDisabledReason: "管理者は削除できません。",
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
      value: { currency: "jpy", unitAmount: 3000, interval: "month", intervalCount: 1, taxBehavior: "inclusive" },
    },
    business: {
      status: "available",
      value: { currency: "jpy", unitAmount: 6000, interval: "month", intervalCount: 1, taxBehavior: "exclusive" },
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
        removeDisabledReason: "最後の復旧担当者は、引き継ぎまたは契約の復旧が完了するまで削除できません。",
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
  inviteManagerDisabledReason: "閲覧のみの管理者は、管理者を招待できません。",
  canUpdateOrganizationName: false,
  updateOrganizationNameDisabledReason: "閲覧のみの管理者は、組織名を変更できません。",
  canAddShop: false,
  addShopDisabledReason: "閲覧のみの管理者は、店舗を追加できません。",
  canDeleteOrganization: false,
  deleteOrganizationDisabledReason: "閲覧のみの管理者は組織を削除できません。",
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
    settingsDisabledReason: "閲覧のみの管理者は、店舗設定を変更できません。",
  })),
};

const meta = {
  id: "features-organizationsettings",
  title: "Features/OrganizationSettings/1. 画面全体",
  component: OrganizationSettingsView,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <Box maxW="1024px" mx="auto" w="full">
        <Story />
      </Box>
    ),
  ],
  args: baseArgs,
} satisfies Meta<typeof OrganizationSettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LoadingPeople: Story = {
  name: "読み込み｜スタッフ",
  render: () => <OrganizationSettingsSkeleton defaultTab="people" features={baseArgs.features} />,
};

export const LoadingShops: Story = {
  name: "読み込み｜店舗",
  render: () => <OrganizationSettingsSkeleton defaultTab="shops" features={baseArgs.features} />,
};

export const LoadingBilling: Story = {
  name: "読み込み｜プランと支払い",
  render: () => <OrganizationSettingsSkeleton defaultTab="billing" features={baseArgs.features} />,
};

export const LoadingSettings: Story = {
  name: "読み込み｜設定",
  render: () => <OrganizationSettingsSkeleton defaultTab="settings" features={baseArgs.features} />,
};

export const LoadingPeopleMultipleOrganizations: Story = {
  name: "読み込み｜スタッフ・複数組織",
  render: () => (
    <OrganizationSettingsSkeleton defaultTab="people" showOrganizationSelector features={baseArgs.features} />
  ),
};

export const MobileLoadingPeople: Story = {
  name: "読み込み｜スタッフ・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <OrganizationSettingsSkeleton defaultTab="people" features={baseArgs.features} />,
};

export const MobileLoadingShops: Story = {
  name: "読み込み｜店舗・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <OrganizationSettingsSkeleton defaultTab="shops" features={baseArgs.features} />,
};

export const MobileLoadingBilling: Story = {
  name: "読み込み｜プランと支払い・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <OrganizationSettingsSkeleton defaultTab="billing" features={baseArgs.features} />,
};

export const MobileLoadingSettings: Story = {
  name: "読み込み｜設定・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <OrganizationSettingsSkeleton defaultTab="settings" features={baseArgs.features} />,
};

export const MobileLoadingPeopleMultipleOrganizations: Story = {
  name: "読み込み｜スタッフ・複数組織・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => (
    <OrganizationSettingsSkeleton defaultTab="people" showOrganizationSelector features={baseArgs.features} />
  ),
};

export const Users: Story = { name: "スタッフ｜通常" };

export const StaffWithoutShop: Story = {
  name: "スタッフ｜店舗未所属",
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
  play: async ({ canvasElement }) => {
    const row = within(canvasElement).getByRole("button", { name: "店舗未所属スタッフのスタッフ詳細を開く" });
    await expect(within(row).getByText("所属店舗なし")).toBeVisible();
  },
};

export const UserListLoadMoreBehavior: Story = {
  name: "スタッフ｜もっと見る（操作確認）",
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
    await expect(canvas.queryByRole("button", { name: "追加ユーザー 9のスタッフ詳細を開く" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "もっと見る" }));
    await expect(canvas.getByRole("button", { name: "追加ユーザー 9のスタッフ詳細を開く" })).toBeVisible();
  },
};

export const FutureAssignmentRemovalBlocked: Story = {
  name: "スタッフ｜未来のシフトあり",
  args: {
    people: baseArgs.people.map((person) =>
      person.id === "person-staff"
        ? {
            ...person,
            canRemove: false,
            removeDisabledReason: "将来のシフトの割り当てを解除してから削除してください。",
          }
        : person,
    ),
  },
};

export const UserNavigationBehavior: Story = {
  name: "スタッフ｜詳細を開く（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: {
    actions: { ...actions, onOpenUser: fn() },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "鈴木 次郎のスタッフ詳細を開く" }));
    await expect(args.actions.onOpenUser).toHaveBeenCalledTimes(1);
    await expect(args.actions.onOpenUser).toHaveBeenCalledWith("person-staff", 10);
  },
};

export const ManagerStatus: Story = {
  name: "スタッフ｜管理者状態を表示",
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

export const LazyTabMountBehavior: Story = {
  name: "画面全体｜タブの遅延mount（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: { defaultTab: "people" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.queryByRole("heading", { name: "全店舗 (2/5)" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("tab", { name: "店舗" }));
    await expect(await canvas.findByRole("heading", { name: "全店舗 (2/5)" })).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("tab", { name: "スタッフ" }));
    await expect(canvas.getByRole("heading", { name: "全スタッフ (8/20)" })).toBeInTheDocument();
  },
};

export const Settings: Story = { name: "設定｜通常", args: { defaultTab: "settings" } };

export const SettingsDeletionUnavailable: Story = {
  name: "設定｜削除不可",
  args: {
    defaultTab: "settings",
    canDeleteOrganization: false,
    deleteOrganizationDisabledReason: "有料契約やプラン変更を終了してから、組織を削除してください。",
  },
  play: async ({ canvasElement }) => {
    const deleteButton = within(canvasElement).getByRole("button", { name: /^削除する$/ });

    await expect(deleteButton).toBeDisabled();
    await expect(deleteButton).toHaveAccessibleDescription(
      "有料契約またはプラン変更の予約が残っています。\n「プランと支払い」で契約や予約を終了してから、組織を削除してください。",
    );
  },
};

export const SettingsDeletionUnavailableWithStripeSubscription: Story = {
  name: "設定｜Stripe契約が残るため削除不可（旧reason互換）",
  args: {
    defaultTab: "settings",
    canDeleteOrganization: false,
    deleteOrganizationDisabledReason: "Stripeの契約終了を確認してから、グループを削除してください。",
  },
  play: async ({ canvasElement }) => {
    const deleteButton = within(canvasElement).getByRole("button", { name: /^削除する$/ });

    await expect(deleteButton).toBeDisabled();
    await expect(deleteButton).toHaveAccessibleDescription(
      "有料契約またはプラン変更の予約が残っています。\n「プランと支払い」で契約や予約を終了してから、組織を削除してください。",
    );
  },
};

export const OrganizationDeletionActionBehavior: Story = {
  name: "設定｜組織削除（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: {
    defaultTab: "settings",
    actions: { ...actions, onDeleteOrganization: fn() },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /^削除する$/ }));
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
    await expect(canvas.getByRole("button", { name: "管理者を変更" })).toBeEnabled();
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "組織名を変更" }),
      "閲覧のみの管理者は、組織名を変更できません。",
    );
    await userEvent.click(canvas.getByRole("tab", { name: "店舗" }));
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "店舗を追加する" }),
      "閲覧のみの管理者は、店舗を追加できません。",
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
      canvas.getByRole("button", { name: /^削除する$/ }),
      "閲覧のみの管理者は組織を削除できません。",
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
      paymentMethodDisabledReason:
        "無料プランでは、支払い情報の管理は不要です。\n有料プランを契約するときに、Stripeで登録します。",
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
    addShopDisabledReason: "店舗は、組織ごとに5件まで登録できます。",
    billing: billing({
      state: "pro",
      currentPlan: "pro",
      peopleUsage: { current: 20, max: 20 },
      shopUsage: { current: 5, max: 5 },
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const addShopButton = canvas.getByRole("button", { name: "店舗を追加する" });
    await expectDisabledActionDescription(addShopButton, "店舗は、組織ごとに5件まで登録できます。");
    await expect(canvas.queryByRole("link", { name: "利用上限について問い合わせる" })).not.toBeInTheDocument();
  },
};

export const ShopAdditionHiddenBehavior: Story = {
  name: "店舗｜rollout gate閉鎖（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: {
    defaultTab: "shops",
    features: { ...baseArgs.features, shopAddition: false },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button", { name: "店舗を追加する" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: /全店舗/ })).toBeInTheDocument();
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
      paymentMethodDisabledReason: "初回支払いの結果を確認中です。\n確定後に、Stripeで支払い情報を管理できます。",
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
    addShopDisabledReason: "支払い結果が確定してから、店舗を追加できます。",
    billing: billing({
      state: "pendingActivation",
      currentPlan: "free",
      targetPlan: "pro",
      peopleUsage: { current: 5, max: 5 },
      shopUsage: { current: 1, max: 1 },
      blockedReason: "有料プランの支払い結果を確認中です。\n無料の基本機能は引き続き利用できます。",
      nextEvent: { label: "支払い結果", date: "確認中" },
      canManagePlan: false,
      canUpdatePaymentMethod: false,
      canUpdateBillingEmail: true,
      canScheduleFree: false,
      managePlanDisabledReason: "支払い結果を確認中のため、別のプランへは変更できません。",
      paymentMethodDisabledReason: "支払い結果を確認中です。\n確定後に、Stripeで支払い情報を管理できます。",
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
    inviteManagerDisabledReason: "契約制限中は、管理者を招待できません。",
    canAddShop: false,
    addShopDisabledReason: "契約制限中は、店舗を追加できません。",
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
    inviteManagerDisabledReason: "組織単位の設定を移行しています。\n完了するまでお待ちください。",
    canAddShop: false,
    addShopDisabledReason: "組織単位のプラン設定を移行しています。\n完了するまでお待ちください。",
    billing: billing({
      state: "migrationPending",
      currentPlan: null,
      blockedReason: "組織単位のプラン設定を移行しています。完了後に自動で利用状態を再確認します。",
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
      blockedReason: "期限までに支払い方法を更新しないと、契約制限中になります。",
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
    inviteManagerDisabledReason: "契約制限中は、管理者を招待できません。",
    canAddShop: false,
    addShopDisabledReason: "契約制限中は、店舗を追加できません。",
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

export const RestrictedWithoutLimitPlan: Story = {
  name: "プランと支払い｜トライアル終了後の利用停止",
  args: {
    ...Restricted.args,
    billing: billing({
      state: "restricted",
      currentPlan: null,
      previousPlan: undefined,
      targetPlan: undefined,
      limitPlan: undefined,
      peopleUsage: { current: 7, max: 0 },
      shopUsage: { current: 2, max: 0 },
      managerUsage: { current: 2, max: 0 },
      requiredReductions: undefined,
      blockedReason: "現在の契約状態では業務データを更新できません。",
      nextEvent: undefined,
      hasStripeCustomer: false,
      canManagePlan: true,
      canUpdatePaymentMethod: false,
      canScheduleFree: false,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryAllByRole("meter")).toHaveLength(0);
    await expect(canvas.getByText("利用停止中はプラン上限を適用していません")).toBeInTheDocument();
    await expect(
      canvas.getByText("データは保持されています。ProまたはBusinessを契約すると利用を再開できます。"),
    ).toBeInTheDocument();
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
  name: "スタッフ｜通常・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: { defaultTab: "people" },
};

export const MobilePendingInvitations: Story = {
  name: "スタッフ｜招待中を含む利用状況・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: {
    defaultTab: "people",
    billing: billing({
      peopleUsage: { current: 8, max: 20, pendingInvitations: 1 },
      managerUsage: { current: 2, max: 5, pendingInvitations: 1 },
    }),
  },
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

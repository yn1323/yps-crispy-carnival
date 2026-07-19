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
  onOpenShopSettings: fn(),
  onManagePlan: fn(),
  onUpdatePaymentMethod: fn(),
  onUpdateBillingEmail: fn(),
  onOpenInvoice: fn(),
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
  peopleUsage: { current: 8, max: 15 },
  shopUsage: { current: 2, max: 5 },
  nextEvent: { label: "次回更新日", date: "2026年8月31日" },
  paymentMethodLabel: "Visa •••• 4242",
  billingEmail: "billing@sakura.example.com",
  invoices: [
    { id: "invoice-july", issuedAt: "2026年7月31日", status: "paid" },
    { id: "invoice-june", issuedAt: "2026年6月30日", status: "paid" },
  ],
  canManagePlan: true,
  canUpdatePaymentMethod: true,
  canUpdateBillingEmail: true,
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
    managePlanDisabledReason: "閲覧のみの管理者はプランを変更できません。",
    paymentMethodDisabledReason: "閲覧のみの管理者は支払い方法を変更できません。",
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
  title: "Features/OrganizationSettings",
  component: OrganizationSettingsView,
  parameters: { layout: "padded" },
  args: baseArgs,
} satisfies Meta<typeof OrganizationSettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Users: Story = {};

export const StaffWithoutShop: Story = {
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
        canRemoveManagerRole: false,
        canRemove: true,
      },
    ],
  },
};

export const UserListLoadMoreBehavior: Story = {
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
  parameters: { screenshot: { skip: true } },
  args: {
    actions: { ...actions, onOpenUser: fn() },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "鈴木 次郎のユーザー詳細を開く" }));
    await expect(args.actions.onOpenUser).toHaveBeenCalledTimes(1);
    await expect(args.actions.onOpenUser).toHaveBeenCalledWith("person-staff");
  },
};

export const ManagerRoleRemoval: Story = {
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
        canRemoveManagerRole: true,
        canRemove: true,
      },
      ...baseArgs.people.slice(1),
    ],
  },
};

export const Shops: Story = { args: { defaultTab: "shops" } };

export const Settings: Story = { args: { defaultTab: "settings" } };

export const SettingsDeletionUnavailable: Story = {
  args: {
    defaultTab: "settings",
    canDeleteOrganization: false,
    deleteOrganizationDisabledReason: "有料契約やプラン変更を終了してからグループを削除してください。",
  },
};

export const OrganizationDeletionActionBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    defaultTab: "settings",
    actions: { ...actions, onDeleteOrganization: fn() },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "このグループを削除" }));
    await expect(args.actions.onDeleteOrganization).toHaveBeenCalledTimes(1);
  },
};

export const ShopRowBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: { defaultTab: "shops", actions: { ...actions, onOpenShop: fn() } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "渋谷店の店舗詳細を開く" }));
    await expect(args.actions.onOpenShop).toHaveBeenCalledWith("shop-shibuya");
  },
};

export const ShopSettingsButtonBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: { defaultTab: "shops", actions: { ...actions, onOpenShopSettings: fn() } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "渋谷店の店舗設定を開く" }));
    await expect(args.actions.onOpenShopSettings).toHaveBeenCalledWith("shop-shibuya");
  },
};

export const DisabledActionReasonsBehavior: Story = {
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
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "渋谷店の店舗設定を開く" }),
      "閲覧のみの管理者は店舗設定を変更できません。",
    );
    await userEvent.click(canvas.getByRole("tab", { name: "プランと支払い" }));
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "有料プランを開始・再開" }),
      "閲覧のみの管理者はプランを変更できません。",
    );
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "支払い方法を更新" }),
      "閲覧のみの管理者は支払い方法を変更できません。",
    );
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "請求先を変更" }),
      "閲覧のみの管理者は請求先を変更できません。",
    );
    await userEvent.click(canvas.getByRole("tab", { name: "設定" }));
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "このグループを削除" }),
      "閲覧のみの管理者はグループを削除できません。",
    );
  },
};

export const MobileDisabledActionReasonsBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: disabledActionReasonArgs,
  play: DisabledActionReasonsBehavior.play,
};

export const Trial: Story = {
  args: {
    defaultTab: "billing",
    billing: billing({
      state: "trial",
      currentPlan: "trial",
      peopleUsage: { current: 12, max: 30 },
      shopUsage: { current: 3, max: 5 },
      nextEvent: { label: "無料体験終了", date: "2026年9月1日 00:00" },
      paymentMethodLabel: undefined,
      invoices: [],
    }),
  },
};

export const Free: Story = {
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
    addShopDisabledReason: "店舗はグループごとに5件まで登録できます。",
    billing: billing({
      state: "free",
      currentPlan: "free",
      peopleUsage: { current: 4, max: 4 },
      shopUsage: { current: 1, max: 1 },
      nextEvent: undefined,
      paymentMethodLabel: undefined,
      invoices: [],
      canUpdatePaymentMethod: false,
      paymentMethodDisabledReason: "Freeでは支払い方法の登録はありません。有料プランを契約するときに登録します。",
      canUpdateBillingEmail: true,
    }),
  },
};

export const FreeBillingCapabilitiesBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: Free.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "プランを確認・変更" })).toBeEnabled();
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "支払い方法を更新" }),
      "Freeでは支払い方法の登録はありません。有料プランを契約するときに登録します。",
    );
    await expect(canvas.getByRole("button", { name: "請求先を変更" })).toBeEnabled();
  },
};

export const Pro: Story = { args: { defaultTab: "billing" } };

export const Business: Story = {
  args: {
    defaultTab: "billing",
    canAddShop: false,
    addShopDisabledReason: "店舗はグループごとに5件まで登録できます。",
    billing: billing({
      state: "business",
      currentPlan: "business",
      peopleUsage: { current: 22, max: 30 },
      shopUsage: { current: 5, max: 5 },
    }),
  },
};

export const ComplimentaryBusiness: Story = {
  args: {
    defaultTab: "billing",
    billing: billing({
      state: "business",
      currentPlan: "business",
      isComplimentary: true,
      peopleUsage: { current: 22, max: 30 },
      shopUsage: { current: 3, max: 5 },
      nextEvent: undefined,
      paymentMethodLabel: undefined,
      invoices: [],
      canManagePlan: false,
      canUpdatePaymentMethod: false,
      canUpdateBillingEmail: false,
    }),
  },
};

export const ShopCapacityReachedBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: { ...Business.args, defaultTab: "shops" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const addShopButton = canvas.getByRole("button", { name: "店舗を追加" });
    await expectDisabledActionDescription(addShopButton, "店舗はグループごとに5件まで登録できます。");
    await expect(canvas.queryByRole("link", { name: "利用上限について問い合わせる" })).not.toBeInTheDocument();
  },
};

export const InitialPaymentPending: Story = {
  args: {
    defaultTab: "billing",
    billing: billing({
      state: "initialPaymentPending",
      currentPlan: "pro",
      nextEvent: { label: "支払い結果", date: "確認中" },
      canManagePlan: false,
      managePlanDisabledReason: "初回支払いの結果を確認中のため、プランを変更できません。",
    }),
  },
};

export const PendingActivationFreeFallback: Story = {
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
      peopleUsage: { current: 4, max: 4 },
      shopUsage: { current: 1, max: 1 },
      blockedReason: "有料プランの支払い結果を確認中です。Freeの基本機能は引き続き利用できます。",
      nextEvent: { label: "支払い結果", date: "確認中" },
      canManagePlan: false,
      canUpdatePaymentMethod: false,
      canUpdateBillingEmail: true,
      managePlanDisabledReason: "支払い結果を確認中のため、別のプラン変更はできません。",
      paymentMethodDisabledReason: "支払い結果を確認中です。確定後に支払い方法を変更できます。",
    }),
  },
};

export const PendingActivationRestrictedRecovery: Story = {
  args: {
    defaultTab: "billing",
    managerInvitations: [],
    canInviteManager: false,
    managerInvitationMode: "addition",
    freeManagerExchangeCandidates: [],
    inviteManagerDisabledReason: "契約制限中は管理者を招待できません。",
    canUpdateOrganizationName: false,
    updateOrganizationNameDisabledReason: "契約制限中はグループ名を変更できません。",
    canAddShop: false,
    addShopDisabledReason: "契約制限中は店舗を追加できません。",
    people: restrictedPeople,
    shops: baseArgs.shops,
    billing: billing({
      state: "pendingActivation",
      currentPlan: null,
      targetPlan: "pro",
      peopleUsage: { current: 7, max: 4 },
      shopUsage: { current: 2, max: 1 },
      blockedReason: "Freeの利用人数と店舗数を超えています。ユーザーまたは店舗を削除してから再確認してください。",
      nextEvent: { label: "支払い結果", date: "確認中" },
      canManagePlan: true,
      canUpdatePaymentMethod: true,
      canUpdateBillingEmail: true,
    }),
  },
};

export const MigrationPending: Story = {
  args: {
    defaultTab: "billing",
    managerInvitations: [],
    canInviteManager: false,
    managerInvitationMode: "addition",
    freeManagerExchangeCandidates: [],
    inviteManagerDisabledReason: "グループ単位の設定を移行しています。完了までお待ちください。",
    canUpdateOrganizationName: false,
    updateOrganizationNameDisabledReason: "グループ単位の設定を移行しています。完了までお待ちください。",
    canAddShop: false,
    addShopDisabledReason: "グループ単位のプラン設定を移行しています。完了までお待ちください。",
    billing: billing({
      state: "migrationPending",
      currentPlan: null,
      blockedReason: "グループ単位のプラン設定を移行しています。完了後に自動で利用状態を再確認します。",
      nextEvent: undefined,
      paymentMethodLabel: undefined,
      invoices: [],
      canManagePlan: false,
      canUpdatePaymentMethod: false,
      canUpdateBillingEmail: false,
      managePlanDisabledReason: "設定の移行が完了するまでお待ちください。",
      paymentMethodDisabledReason: "設定の移行が完了するまでお待ちください。",
      billingEmailDisabledReason: "設定の移行が完了するまでお待ちください。",
    }),
  },
};

export const Grace: Story = {
  args: {
    defaultTab: "billing",
    billing: billing({
      state: "grace",
      currentPlan: "pro",
      blockedReason: "支払い方法を更新しないまま期限を過ぎると、契約制限中へ移行します。",
      nextEvent: { label: "支払い猶予期限", date: "2026年8月14日 10:30" },
    }),
  },
};

export const Restricted: Story = {
  args: {
    defaultTab: "billing",
    managerInvitations: [],
    canInviteManager: false,
    managerInvitationMode: "addition",
    freeManagerExchangeCandidates: [],
    inviteManagerDisabledReason: "契約制限中は管理者を招待できません。",
    canUpdateOrganizationName: false,
    updateOrganizationNameDisabledReason: "契約制限中はグループ名を変更できません。",
    canAddShop: false,
    addShopDisabledReason: "契約制限中は店舗を追加できません。",
    people: restrictedPeople,
    shops: baseArgs.shops,
    billing: billing({
      state: "restricted",
      currentPlan: null,
      previousPlan: "pro",
      peopleUsage: { current: 7, max: 4 },
      shopUsage: { current: 2, max: 1 },
      blockedReason: "Freeの利用人数と店舗数を超えています。ユーザーまたは店舗を削除してから再確認してください。",
      nextEvent: undefined,
      paymentMethodLabel: "Visa •••• 4242（支払い失敗）",
    }),
  },
};

export const ScheduledFree: Story = {
  args: {
    defaultTab: "billing",
    billing: billing({
      state: "scheduledFree",
      currentPlan: "pro",
      targetPlan: "free",
      nextEvent: { label: "Free適用予定日", date: "2026年8月31日" },
    }),
  },
};

export const ScheduledPro: Story = {
  args: {
    defaultTab: "billing",
    billing: billing({
      state: "scheduledPro",
      currentPlan: "business",
      targetPlan: "pro",
      peopleUsage: { current: 14, max: 30 },
      nextEvent: { label: "Pro適用予定日", date: "2026年8月31日" },
    }),
  },
};

export const MobileRestricted: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: Restricted.args,
};

export const MobileComplimentaryBusiness: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: ComplimentaryBusiness.args,
};

export const MobileUsers: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: { defaultTab: "people" },
};

export const MobileSettings: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: { defaultTab: "settings" },
};

async function expectDisabledActionDescription(button: HTMLElement, expectedReason: string) {
  await expect(button).toBeDisabled();
  await expect(button).toHaveAccessibleDescription(expectedReason);
}

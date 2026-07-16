import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { OrganizationSettingsView } from ".";
import type { OrganizationBillingView, OrganizationSettingsViewProps } from "./types";

const actions = {
  onUpdateOrganizationName: fn(),
  onInviteManager: fn(),
  onRemovePersonFromCurrentShop: fn(),
  onRemoveManagerRole: fn(),
  onRemovePerson: fn(),
  onResendInvitation: fn(),
  onRevokeInvitation: fn(),
  onAddShop: fn(),
  onArchiveShop: fn(),
  onReactivateShop: fn(),
  onManagePlan: fn(),
  onUpdatePaymentMethod: fn(),
  onUpdateBillingEmail: fn(),
  onOpenInvoice: fn(),
  onSaveFreeSelection: fn(),
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
  canScheduleFree: true,
};

const baseArgs: OrganizationSettingsViewProps = {
  organizationName: "株式会社さくらダイニング",
  canUpdateOrganizationName: true,
  currentShopName: "渋谷店",
  people: [
    {
      id: "person-manager",
      name: "田中 太郎",
      email: "tanaka@sakura.example.com",
      managerRole: "active",
      isStaff: true,
      shopNames: ["渋谷店", "新宿店"],
      currentShopStaffId: "staff-manager-shibuya",
      canRemoveFromCurrentShop: true,
      canRemoveManagerRole: false,
      managerRoleRemovalDisabledReason: "最後の有効管理者の管理者権限は外せません。",
      countsTowardPeopleLimit: true,
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
      currentShopStaffId: null,
      canRemoveFromCurrentShop: false,
      canRemoveManagerRole: false,
      countsTowardPeopleLimit: false,
      canRemove: true,
    },
    {
      id: "person-staff",
      name: "鈴木 次郎",
      email: "suzuki@sakura.example.com",
      managerRole: "none",
      isStaff: true,
      shopNames: ["渋谷店", "新宿店"],
      currentShopStaffId: "staff-suzuki-shibuya",
      canRemoveFromCurrentShop: true,
      canRemoveManagerRole: false,
      countsTowardPeopleLimit: true,
      canRemove: true,
    },
  ],
  managerInvitations: [
    {
      id: "invite-pending",
      email: "new-manager@example.com",
      status: "pending",
      expiresAt: "2026年7月23日 18:00",
      canResend: true,
      canRevoke: true,
    },
    {
      id: "invite-expired",
      email: "expired@example.com",
      status: "expired",
      statusDetail: "有効期限が切れました。再送すると新しいURLを発行します。",
      canResend: true,
      canRevoke: false,
    },
    {
      id: "invite-failed",
      email: "failed@example.com",
      status: "sendFailed",
      statusDetail: "メールを送信できませんでした。アドレスを確認して再送してください。",
      canResend: true,
      canRevoke: true,
    },
  ],
  shops: [
    {
      id: "shop-shibuya",
      name: "渋谷店",
      status: "active",
      isFreeRetainedShop: true,
      canArchive: true,
      canReactivate: false,
    },
    {
      id: "shop-shinjuku",
      name: "新宿店",
      status: "planSuspended",
      isFreeRetainedShop: false,
      canArchive: true,
      canReactivate: false,
      actionDisabledReason: "現在のプランでは複数店舗を再稼働できません。",
    },
    {
      id: "shop-yokohama",
      name: "横浜店",
      status: "archived",
      isFreeRetainedShop: false,
      canArchive: false,
      canReactivate: true,
    },
  ],
  billing: baseBilling,
  freeSelection: {
    selectedManagerId: "person-manager",
    selectedManagerName: "田中 太郎",
    selectedShopId: "shop-shibuya",
    selectedShopName: "渋谷店",
    managerCandidates: [
      { id: "person-manager", name: "田中 太郎", projectedPeopleCount: 4 },
      { id: "person-readonly", name: "佐藤 花子", projectedPeopleCount: 4 },
    ],
    shopCandidates: [
      { id: "shop-shibuya", name: "渋谷店" },
      { id: "shop-shinjuku", name: "新宿店" },
    ],
    projectedPeopleCount: 4,
    readOnlyManagerNames: ["佐藤 花子"],
    suspendedShopNames: ["新宿店"],
    isComplete: true,
  },
  canInviteManager: true,
  managerInvitationMode: "addition",
  freeManagerExchangeCandidates: [],
  canAddShop: true,
  actions,
};

const billing = (overrides: Partial<OrganizationBillingView>): OrganizationBillingView => ({
  ...baseBilling,
  ...overrides,
});

const shopCapacityReachedShops = baseArgs.shops.map((shop) =>
  shop.status === "active"
    ? shop
    : {
        ...shop,
        canReactivate: false,
        actionDisabledReason: "稼働店舗数が現在のプラン上限に達しています。別の店舗をアーカイブしてください。",
      },
);

const restrictedPeople = baseArgs.people.map((person) =>
  person.currentShopStaffId
    ? {
        ...person,
        canRemoveFromCurrentShop: false,
        removeFromCurrentShopDisabledReason: "現在の契約状態では店舗所属を変更できません。",
        ...(person.id === "person-manager"
          ? {
              canRemove: false,
              removeDisabledReason: "最後の復旧担当者は、引き継ぎまたは契約復旧まで削除できません。",
            }
          : {}),
      }
    : person,
);

const restrictedShops = baseArgs.shops.map((shop) =>
  shop.status === "active"
    ? shop
    : {
        ...shop,
        canReactivate: false,
        actionDisabledReason: "契約制限中は店舗を再稼働できません。",
      },
);

const disabledActionReasonArgs: Pick<
  OrganizationSettingsViewProps,
  | "people"
  | "shops"
  | "canUpdateOrganizationName"
  | "updateOrganizationNameDisabledReason"
  | "canInviteManager"
  | "inviteManagerDisabledReason"
  | "canAddShop"
  | "addShopDisabledReason"
  | "billing"
> = {
  canUpdateOrganizationName: false,
  updateOrganizationNameDisabledReason: "閲覧のみの管理者は事業者名を変更できません。",
  canInviteManager: false,
  inviteManagerDisabledReason: "閲覧のみの管理者は管理者を招待できません。",
  canAddShop: false,
  addShopDisabledReason: "閲覧のみの管理者は店舗を追加できません。",
  billing: billing({
    state: "pendingActivation",
    currentPlan: null,
    targetPlan: "pro",
    canManagePlan: false,
    canUpdatePaymentMethod: false,
    canUpdateBillingEmail: false,
    canScheduleFree: false,
    managePlanDisabledReason: "閲覧のみの管理者はプランを変更できません。",
    paymentMethodDisabledReason: "閲覧のみの管理者は支払い方法を変更できません。",
    billingEmailDisabledReason: "閲覧のみの管理者は請求先を変更できません。",
  }),
  people: baseArgs.people.map((person) =>
    person.id === "person-manager"
      ? {
          ...person,
          canRemoveFromCurrentShop: false,
          removeFromCurrentShopDisabledReason: "アーカイブ済み店舗の所属は変更できません。",
        }
      : person,
  ),
  shops: baseArgs.shops.map((shop) =>
    shop.id === "shop-shinjuku"
      ? {
          ...shop,
          canArchive: false,
          canReactivate: false,
          actionDisabledReason: "閲覧のみの管理者は店舗の状態を変更できません。",
        }
      : shop,
  ),
};

const meta = {
  title: "Features/OrganizationSettings",
  component: OrganizationSettingsView,
  parameters: { layout: "padded" },
  args: baseArgs,
} satisfies Meta<typeof OrganizationSettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PeopleAndInvitations: Story = {};

export const FutureAssignmentRemovalBlocked: Story = {
  args: {
    people: baseArgs.people.map((person) =>
      person.id === "person-staff"
        ? {
            ...person,
            canRemove: false,
            removeDisabledReason: "将来のシフト割当を解除してから削除してください。",
            futureAssignments: [
              {
                date: "2026-08-03",
                startTime: "10:00",
                endTime: "18:00",
                shopName: "渋谷店",
                periodStart: "2026-08-01",
                periodEnd: "2026-08-15",
              },
              {
                date: "2026-08-07",
                startTime: "12:00",
                endTime: "20:00",
                shopName: "新宿店",
                periodStart: "2026-08-01",
                periodEnd: "2026-08-15",
              },
            ],
            hasMoreFutureAssignments: false,
          }
        : person,
    ),
  },
};

export const BillingContactRemovalBlockedBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    people: baseArgs.people.map((person) =>
      person.id === "person-staff"
        ? {
            ...person,
            email: baseBilling.billingEmail,
            canRemove: false,
            removeDisabledReason: "請求先メールアドレスを変更してから削除してください。",
          }
        : person,
    ),
  },
  play: async ({ canvasElement }) => {
    await expectDisabledActionDescription(
      within(canvasElement).getByRole("button", { name: "鈴木 次郎を事業者から削除" }),
      "請求先メールアドレスを変更してから削除してください。",
      canvasElement,
    );
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
        currentShopStaffId: null,
        canRemoveFromCurrentShop: false,
        canRemoveManagerRole: true,
        countsTowardPeopleLimit: true,
        canRemove: true,
      },
      ...baseArgs.people.slice(1),
    ],
  },
};

export const InvitationLimitAndConflict: Story = {
  args: {
    managerInvitations: [
      {
        id: "invite-limit",
        email: "limit@example.com",
        status: "limitReached",
        statusDetail: "利用人数の上限に達しているため、招待を承認できません。",
        canResend: false,
        canRevoke: true,
      },
      {
        id: "invite-conflict",
        email: "conflict@example.com",
        status: "conflict",
        statusDetail: "新しい招待が発行されたため、この招待は使用できません。",
        canResend: true,
        canRevoke: false,
      },
    ],
  },
};

export const Shops: Story = { args: { defaultTab: "shops" } };

export const DisabledActionReasonsBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: disabledActionReasonArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "事業者名を変更" }),
      "閲覧のみの管理者は事業者名を変更できません。",
      canvasElement,
    );
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "管理者を招待" }),
      "閲覧のみの管理者は管理者を招待できません。",
      canvasElement,
    );
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "田中 太郎を操作中の店舗から削除" }),
      "アーカイブ済み店舗の所属は変更できません。",
      canvasElement,
    );
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "田中 太郎の管理者権限を外す" }),
      "最後の有効管理者の管理者権限は外せません。",
      canvasElement,
    );
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "田中 太郎を事業者から削除" }),
      "最後の有効管理者は削除できません。",
      canvasElement,
    );

    await userEvent.click(canvas.getByRole("tab", { name: "店舗" }));
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "店舗を追加" }),
      "閲覧のみの管理者は店舗を追加できません。",
      canvasElement,
    );
    const archiveButton = canvas.getByRole("button", { name: "新宿店をアーカイブ" });
    const reactivateButton = canvas.getByRole("button", { name: "新宿店を再稼働" });
    await expectDisabledActionDescription(
      archiveButton,
      "閲覧のみの管理者は店舗の状態を変更できません。",
      canvasElement,
    );
    await expectDisabledActionDescription(
      reactivateButton,
      "閲覧のみの管理者は店舗の状態を変更できません。",
      canvasElement,
    );
    await expect(archiveButton.getAttribute("aria-describedby")).toBe(
      reactivateButton.getAttribute("aria-describedby"),
    );
    const sharedDescriptionId = archiveButton.getAttribute("aria-describedby");
    await expect(canvasElement.ownerDocument.querySelectorAll(`[id="${sharedDescriptionId}"]`)).toHaveLength(1);

    await userEvent.click(canvas.getByRole("tab", { name: "プランと支払い" }));
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "有料プランを開始・再開" }),
      "閲覧のみの管理者はプランを変更できません。",
      canvasElement,
    );
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "支払い方法を更新" }),
      "閲覧のみの管理者は支払い方法を変更できません。",
      canvasElement,
    );
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "請求先を変更" }),
      "閲覧のみの管理者は請求先を変更できません。",
      canvasElement,
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
    managerInvitationMode: "freeManagerExchange",
    freeManagerExchangeCandidates: [{ id: "person-staff", name: "鈴木 次郎", email: "suzuki@sakura.example.com" }],
    canAddShop: false,
    addShopDisabledReason: "稼働店舗数が現在のプラン上限に達しています。プランを確認してください。",
    shops: shopCapacityReachedShops,
    billing: billing({
      state: "free",
      currentPlan: "free",
      peopleUsage: { current: 4, max: 4 },
      shopUsage: { current: 1, max: 1 },
      nextEvent: undefined,
      paymentMethodLabel: undefined,
      invoices: [],
      canScheduleFree: false,
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
      canvasElement,
    );
    await expect(canvas.getByRole("button", { name: "請求先を変更" })).toBeEnabled();
  },
};

export const Pro: Story = { args: { defaultTab: "billing" } };

export const ProManagerCapacityReached: Story = {
  args: {
    canInviteManager: false,
    inviteManagerDisabledReason: "有効管理者数が現在のプラン上限に達しています。",
    billing: billing({
      peopleUsage: { current: 15, max: 15 },
    }),
  },
};

export const Business: Story = {
  args: {
    defaultTab: "billing",
    canAddShop: false,
    addShopDisabledReason: "稼働店舗数が現在のプラン上限に達しています。プランを確認してください。",
    shops: shopCapacityReachedShops,
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
      canScheduleFree: false,
    }),
  },
};

export const ShopCapacityReachedBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: { ...Business.args, defaultTab: "shops" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const addShopButton = canvas.getByRole("button", { name: "店舗を追加" });
    await expectDisabledActionDescription(
      addShopButton,
      "稼働店舗数が現在のプラン上限に達しています。プランを確認してください。",
      canvasElement,
    );
    await expect(canvas.getByRole("link", { name: "利用上限について問い合わせる" })).toHaveAttribute(
      "href",
      "/contact",
    );
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
      canScheduleFree: false,
      managePlanDisabledReason: "初回支払いの結果を確認中のため、プランを変更できません。",
    }),
  },
};

export const PendingActivationFreeFallback: Story = {
  args: {
    defaultTab: "billing",
    canInviteManager: false,
    inviteManagerDisabledReason: "支払い結果が確定してから管理者を招待できます。",
    canAddShop: false,
    addShopDisabledReason: "支払い結果が確定してから店舗を追加できます。",
    shops: shopCapacityReachedShops,
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
      canScheduleFree: false,
      managePlanDisabledReason: "支払い結果を確認中のため、別のプラン変更はできません。",
      paymentMethodDisabledReason: "支払い結果を確認中です。確定後に支払い方法を変更できます。",
    }),
  },
};

export const PendingActivationRestrictedRecovery: Story = {
  args: {
    defaultTab: "billing",
    canUpdateOrganizationName: false,
    updateOrganizationNameDisabledReason: "契約制限中は事業者名を変更できません。",
    canInviteManager: false,
    inviteManagerDisabledReason: "契約制限中は管理者を招待できません。",
    canAddShop: false,
    addShopDisabledReason: "契約制限中は店舗を追加・再稼働できません。",
    people: restrictedPeople,
    shops: restrictedShops,
    billing: billing({
      state: "pendingActivation",
      currentPlan: null,
      targetPlan: "pro",
      peopleUsage: { current: 7, max: 4 },
      shopUsage: { current: 2, max: 1 },
      blockedReason: "Freeの利用人数と店舗数を超えています。利用者削除または店舗アーカイブ後に再確認してください。",
      nextEvent: { label: "支払い結果", date: "確認中" },
      canManagePlan: true,
      canUpdatePaymentMethod: true,
      canUpdateBillingEmail: true,
      canScheduleFree: true,
    }),
  },
};

export const MigrationPending: Story = {
  args: {
    defaultTab: "billing",
    canUpdateOrganizationName: false,
    updateOrganizationNameDisabledReason: "事業者単位の設定を移行しています。完了までお待ちください。",
    canInviteManager: false,
    inviteManagerDisabledReason: "事業者単位のプラン設定を移行しています。完了までお待ちください。",
    canAddShop: false,
    addShopDisabledReason: "事業者単位のプラン設定を移行しています。完了までお待ちください。",
    billing: billing({
      state: "migrationPending",
      currentPlan: null,
      blockedReason: "事業者単位のプラン設定を移行しています。完了後に自動で利用状態を再確認します。",
      nextEvent: undefined,
      paymentMethodLabel: undefined,
      invoices: [],
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
    canUpdateOrganizationName: false,
    updateOrganizationNameDisabledReason: "契約制限中は事業者名を変更できません。",
    canInviteManager: false,
    inviteManagerDisabledReason: "契約制限中は管理者を招待できません。",
    canAddShop: false,
    addShopDisabledReason: "契約制限中は店舗を追加・再稼働できません。",
    people: restrictedPeople,
    shops: restrictedShops,
    billing: billing({
      state: "restricted",
      currentPlan: null,
      previousPlan: "pro",
      peopleUsage: { current: 7, max: 4 },
      shopUsage: { current: 2, max: 1 },
      blockedReason: "Freeの利用人数と店舗数を超えています。利用者削除または店舗アーカイブ後に再確認してください。",
      nextEvent: undefined,
      paymentMethodLabel: "Visa •••• 4242（支払い失敗）",
    }),
    freeSelection: {
      selectedManagerId: null,
      selectedManagerName: null,
      selectedShopId: null,
      selectedShopName: null,
      managerCandidates: [
        { id: "person-manager", name: "田中 太郎", projectedPeopleCount: 7 },
        { id: "person-readonly", name: "佐藤 花子", projectedPeopleCount: 7 },
      ],
      shopCandidates: [
        { id: "shop-shibuya", name: "渋谷店" },
        { id: "shop-shinjuku", name: "新宿店" },
      ],
      projectedPeopleCount: 7,
      readOnlyManagerNames: [],
      suspendedShopNames: [],
      isComplete: false,
      incompleteReason:
        "残す管理者と店舗が未選択です。変更予約はできますが、このまま適用時刻を迎えると契約制限が続きます。",
    },
  },
};

export const RestrictedShopActionsBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: { ...Restricted.args, defaultTab: "shops" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "新宿店をアーカイブ" })).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "新宿店を再稼働" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "横浜店を再稼働" })).toBeDisabled();
  },
};

export const RestrictedRecoveryPersonActionsBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: { ...Restricted.args, defaultTab: "people" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "田中 太郎を事業者から削除" }),
      "最後の復旧担当者は、引き継ぎまたは契約復旧まで削除できません。",
      canvasElement,
    );
    await expectDisabledActionDescription(
      canvas.getByRole("button", { name: "田中 太郎を操作中の店舗から削除" }),
      "現在の契約状態では店舗所属を変更できません。",
      canvasElement,
    );
  },
};

export const RestrictedRecoveryManagerProjectionBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    ...Restricted.args,
    actions: { ...actions, onSaveFreeSelection: fn() },
    freeSelection: {
      selectedManagerId: "person-manager",
      selectedManagerName: "田中 太郎",
      selectedShopId: "shop-shibuya",
      selectedShopName: "渋谷店",
      managerCandidates: [
        { id: "person-manager", name: "田中 太郎", projectedPeopleCount: 5 },
        { id: "person-readonly", name: "佐藤 花子", projectedPeopleCount: 4 },
      ],
      shopCandidates: [{ id: "shop-shibuya", name: "渋谷店" }],
      projectedPeopleCount: 5,
      readOnlyManagerNames: ["佐藤 花子"],
      suspendedShopNames: [],
      isComplete: false,
      incompleteReason: "Freeの利用人数上限を超えています。事業者から利用者を削除してください。",
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Freeで残す内容を確認" }));
    const screen = within(canvasElement.ownerDocument.body);
    const dialog = await screen.findByRole("alertdialog", { name: "Freeプランで残す内容を確認" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Freeで残す管理者"), "person-readonly");
    await expect(within(dialog).getByText("4名")).toBeInTheDocument();
    const resumeButton = within(dialog).getByRole("button", { name: "Freeで利用を再開" });
    await expect(resumeButton).toBeEnabled();
    await userEvent.click(resumeButton);
    await expect(args.actions.onSaveFreeSelection).toHaveBeenCalledWith("person-readonly", "shop-shibuya");
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

export const MobileIncompleteFreeConfirmation: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: {
    ...Restricted.args,
    actions: { ...actions, onSaveFreeSelection: fn() },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Freeで残す内容を確認" }));
    const screen = within(document.body);
    const dialog = await screen.findByRole("alertdialog", { name: "Freeプランで残す内容を確認" });
    await expect(within(dialog).getByText("Freeの成立条件がそろっていません")).toBeInTheDocument();
    const saveButton = within(dialog).getByRole("button", { name: "Free設定を保存" });
    await expect(saveButton).toBeEnabled();
    await userEvent.click(saveButton);
    await expect(args.actions.onSaveFreeSelection).toHaveBeenCalledWith(null, null);
  },
};

export const FreeConfirmationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: { defaultTab: "billing" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Freeで残す内容を確認" }));
    const screen = within(document.body);
    const dialog = await screen.findByRole("alertdialog", { name: "Freeプランで残す内容を確認" });
    await expect(within(dialog).getByText("田中 太郎")).toBeInTheDocument();
    await expect(within(dialog).getByText("渋谷店")).toBeInTheDocument();
    await expect(within(dialog).getByRole("button", { name: "Free設定を保存" })).toBeEnabled();
  },
};

export const FreeConfirmationWithoutActiveShopBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    defaultTab: "billing",
    actions: { ...actions, onSaveFreeSelection: fn() },
    freeSelection: {
      ...baseArgs.freeSelection,
      selectedShopId: null,
      selectedShopName: null,
      shopCandidates: [],
      suspendedShopNames: [],
      isComplete: true,
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Freeで残す内容を確認" }));
    const screen = within(canvasElement.ownerDocument.body);
    const dialog = await screen.findByRole("alertdialog", { name: "Freeプランで残す内容を確認" });
    await expect(within(dialog).getByText("稼働店舗なし")).toBeInTheDocument();
    const saveButton = within(dialog).getByRole("button", { name: "Free設定を保存" });
    await expect(saveButton).toBeEnabled();
    await userEvent.click(saveButton);
    await expect(args.actions.onSaveFreeSelection).toHaveBeenCalledWith("person-manager", null);
  },
};

async function expectDisabledActionDescription(
  button: HTMLElement,
  expectedReason: string,
  canvasElement: HTMLElement,
) {
  await expect(button).toBeDisabled();
  const descriptionId = button.getAttribute("aria-describedby");
  await expect(descriptionId).toBeTruthy();
  const description = canvasElement.ownerDocument.getElementById(descriptionId ?? "");
  await expect(description).toBeVisible();
  await expect(description).toHaveTextContent(expectedReason);
}

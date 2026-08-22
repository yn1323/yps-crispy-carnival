import { Stack } from "@chakra-ui/react";
import { arrayMove } from "@dnd-kit/sortable";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { PeopleSection } from "@/src/components/features/OrganizationSettings";
import type { OrganizationPersonView } from "@/src/components/features/OrganizationSettings/types";
import { AuthenticatedAppShell } from "@/src/components/templates/AuthenticatedAppShell";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import {
  AppStaffHeader,
  AppStaffPageStateView,
  AppStaffReadOnlyNotice,
  type ShopOption,
  StaffInvitationShopSelectionDialog,
} from ".";

const people: OrganizationPersonView[] = [
  {
    id: "person-manager",
    name: "山田 花子",
    email: "manager@example.com",
    managerRole: "active",
    isStaff: true,
    isLineConnected: true,
    lineStatus: "linked_following",
    shopNames: ["本店", "駅前店"],
    shopIds: ["shop-preview-a", "shop-preview-b"],
    canRemoveManagerRole: true,
    canRemove: true,
  },
  {
    id: "person-staff",
    name: "佐藤 太郎",
    email: "staff@example.com",
    managerRole: "none",
    isStaff: true,
    isLineConnected: false,
    lineStatus: "unlinked",
    shopNames: ["本店"],
    shopIds: ["shop-preview-a"],
    canRemoveManagerRole: false,
    canRemove: true,
  },
];

const loadedPerson: OrganizationPersonView = {
  ...people[1],
  id: "person-loaded",
  name: "追加読込スタッフ",
};

const shopOptions = [
  { value: "shop-preview-a" as never, label: "本店" },
  { value: "shop-preview-b" as never, label: "駅前店" },
];

const invitationShops: ShopOption[] = [
  { id: "shop-preview-a" as never, name: "本店" },
  { id: "shop-preview-b" as never, name: "駅前店" },
  { id: "shop-preview-c" as never, name: "南口店" },
];

function StaffReadyPreview({
  withNextPage = false,
  readOnly = false,
  empty = false,
  singleShop = false,
  singlePerson = false,
  filteredByShop = false,
}: {
  withNextPage?: boolean;
  readOnly?: boolean;
  empty?: boolean;
  singleShop?: boolean;
  singlePerson?: boolean;
  filteredByShop?: boolean;
}) {
  const initialPeople = empty ? [] : singlePerson ? people.slice(0, 1) : people;
  const [visiblePeople, setVisiblePeople] = useState(initialPeople);
  const [canLoadMore, setCanLoadMore] = useState(withNextPage);

  return (
    <Stack gap={{ base: 6, lg: 8 }}>
      <AppStaffHeader
        value={filteredByShop ? (shopOptions[0]?.value ?? null) : null}
        options={singleShop ? shopOptions.slice(0, 1) : shopOptions}
        onChange={() => {}}
      />
      {readOnly && <AppStaffReadOnlyNotice />}
      <PeopleSection
        people={visiblePeople}
        peopleUsage={{ current: empty ? 0 : singlePerson ? 1 : 12, max: 40 }}
        onManageManagers={() => {}}
        onOpenUser={() => {}}
        staffOrder={
          filteredByShop
            ? undefined
            : {
                disabled: readOnly || singlePerson,
                disabledReason: readOnly
                  ? "閲覧のみの管理者は、スタッフの並び順を変更できません。"
                  : singlePerson
                    ? "2名以上のスタッフがいると並び替えできます。"
                    : undefined,
                isSaving: false,
                onReorder: (activePersonId, overPersonId) => {
                  setVisiblePeople((current) => {
                    const activeIndex = current.findIndex((person) => person.id === activePersonId);
                    const overIndex = current.findIndex((person) => person.id === overPersonId);
                    if (activeIndex < 0 || overIndex < 0) return current;
                    return arrayMove(current, activeIndex, overIndex);
                  });
                },
              }
        }
        onAddStaff={() => {}}
        canAddStaff={!readOnly}
        addStaffDisabledReason={readOnly ? "閲覧のみの管理者は、スタッフを追加できません。" : undefined}
        canLoadMorePeople={canLoadMore}
        onLoadMorePeople={() => {
          setVisiblePeople((current) => [...current, loadedPerson]);
          setCanLoadMore(false);
        }}
      />
    </Stack>
  );
}

function AppCompositionPreview() {
  return (
    <AuthenticatedAppShell activeKey="staff" activeOrganizationId="organization-preview">
      <AuthenticatedPageContent includeMobileNavigation>
        <StaffReadyPreview />
      </AuthenticatedPageContent>
    </AuthenticatedAppShell>
  );
}

const meta = {
  title: "Pages/AppStaff/States",
  component: AppStaffPageStateView,
  args: { state: { kind: "loading" } },
  parameters: { layout: "padded" },
} satisfies Meta<typeof AppStaffPageStateView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};

export const LoadingMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const QueryError: Story = {
  args: { state: { kind: "error" } },
};

export const ReadyDesktop: Story = {
  render: () => <StaffReadyPreview />,
};

export const SingleShop: Story = {
  render: () => <StaffReadyPreview singleShop />,
};

export const FilteredByShop: Story = {
  render: () => <StaffReadyPreview filteredByShop />,
};

export const ReadyMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => <StaffReadyPreview />,
};

export const AppCompositionDesktop: Story = {
  name: "スタッフ一覧・新shell・デスクトップ",
  parameters: { layout: "fullscreen", vrt: { releaseFixedHeader: true } },
  render: () => <AppCompositionPreview />,
};

export const AppCompositionMobile: Story = {
  ...AppCompositionDesktop,
  name: "スタッフ一覧・新shell・モバイル414px",
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const ReadOnlyMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => <StaffReadyPreview readOnly />,
};

export const EmptyMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => <StaffReadyPreview empty />,
};

export const SinglePersonOrderUnavailable: Story = {
  render: () => <StaffReadyPreview singlePerson />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dragHandle = canvas.getByRole("button", { name: /山田 花子をドラッグして並べ替え/ });
    await expect(dragHandle).toHaveAttribute("aria-disabled", "true");
    await expect(dragHandle).toHaveAttribute("title", "2名以上のスタッフがいると並び替えできます。");
  },
};

export const KeyboardDragBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <StaffReadyPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dragHandle = canvas.getByRole("button", { name: /佐藤 太郎をドラッグして並べ替え/ });
    dragHandle.focus();
    await userEvent.keyboard("[Space][ArrowUp][Space]");

    const rows = canvas.getAllByRole("listitem");
    await expect(rows[0]).toHaveTextContent("佐藤 太郎");
    await expect(rows[1]).toHaveTextContent("山田 花子");
  },
};

export const InvitationShopSelectionMobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => (
    <StaffInvitationShopSelectionDialog
      shops={invitationShops}
      isOpen
      onOpenChange={() => {}}
      onClose={() => {}}
      onSelect={() => {}}
    />
  ),
};

function InvitationShopSelectionBehaviorPreview() {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedShopName, setSelectedShopName] = useState<string | null>(null);

  return (
    <>
      {selectedShopName && <output>{selectedShopName}でスタッフ追加を開始</output>}
      <StaffInvitationShopSelectionDialog
        shops={invitationShops}
        isOpen={isOpen}
        onOpenChange={({ open }) => setIsOpen(open)}
        onClose={() => setIsOpen(false)}
        onSelect={(shopId) => {
          setSelectedShopName(invitationShops.find((shop) => shop.id === shopId)?.name ?? null);
        }}
      />
    </>
  );
}

export const InvitationShopSelectionBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InvitationShopSelectionBehaviorPreview />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "スタッフを追加する店舗を選択" });
    await userEvent.click(within(dialog).getByRole("button", { name: "駅前店をスタッフ追加の対象店舗として選択" }));
    await expect(await page.findByText("駅前店でスタッフ追加を開始")).toBeInTheDocument();
    await waitFor(() => {
      expect(page.queryByRole("dialog", { name: "スタッフを追加する店舗を選択" })).not.toBeInTheDocument();
    });
  },
};

export const LoadMorePeopleBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <StaffReadyPreview withNextPage />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "もっと見る" }));
    await expect(await canvas.findByText("追加読込スタッフ")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "もっと見る" })).not.toBeInTheDocument();
  },
};

function ErrorRetryPreview() {
  const [retried, setRetried] = useState(false);
  return retried ? (
    <output>再読み込みを開始しました</output>
  ) : (
    <AppStaffPageStateView state={{ kind: "error" }} onRetry={() => setRetried(true)} />
  );
}

export const QueryErrorRetryBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ErrorRetryPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "再試行する" }));
    await expect(await canvas.findByText("再読み込みを開始しました")).toBeInTheDocument();
  },
};

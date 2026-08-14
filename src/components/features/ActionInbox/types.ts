export type ActionInboxItemCategory = "shift" | "staff" | "notification" | "management";

export type ActionInboxCategory = "all" | ActionInboxItemCategory;

export type ActionInboxMetadataItem = {
  label: string;
  icon?: "shop" | "calendar" | "people" | "mail" | "clock";
};

type ActionInboxActionBase = {
  label: string;
  emphasis?: "primary" | "secondary" | "danger";
};

export type ActionInboxAction =
  | (ActionInboxActionBase & {
      disabled?: false;
      disabledReason?: never;
      failureMessage?: string;
      onClick: () => void | Promise<void>;
    } & (
        | {
            removesItemOnSuccess: true;
            successMessage: string;
          }
        | {
            removesItemOnSuccess?: false;
            successMessage?: never;
          }
      ))
  | (ActionInboxActionBase & {
      disabled: true;
      disabledReason: string;
      removesItemOnSuccess?: never;
      successMessage?: never;
      failureMessage?: never;
      onClick?: never;
    });

export type ActionInboxActions = readonly [ActionInboxAction] | readonly [ActionInboxAction, ActionInboxAction];

type ActionInboxItemBase<Category extends ActionInboxItemCategory> = {
  id: string;
  category: Category;
  statusLabel: string;
  title: string;
  description?: string;
  metadata: readonly [ActionInboxMetadataItem, ...ActionInboxMetadataItem[]];
  actions: ActionInboxActions;
};

export type ShiftActionInboxItem = ActionInboxItemBase<"shift">;
export type StaffActionInboxItem = ActionInboxItemBase<"staff">;
export type NotificationActionInboxItem = ActionInboxItemBase<"notification">;
export type ManagementActionInboxItem = ActionInboxItemBase<"management">;

export type ActionInboxItem =
  | ShiftActionInboxItem
  | StaffActionInboxItem
  | NotificationActionInboxItem
  | ManagementActionInboxItem;

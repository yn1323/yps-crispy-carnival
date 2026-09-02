import { Alert } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";
import type { PeopleCapacityResolution } from "@/src/domains/organizationBilling/peopleCapacity";

type Props = {
  resolution: PeopleCapacityResolution;
  retryActionLabel: string;
  onOpenBillingSettings?: () => void;
};

export function PeopleCapacityResolutionAlert({ resolution, retryActionLabel, onOpenBillingSettings }: Props) {
  const presentation = getPresentation(resolution, retryActionLabel, onOpenBillingSettings !== undefined);

  return (
    <Alert.Root status="warning" alignItems="flex-start">
      <Alert.Indicator mt={1} />
      <Alert.Content>
        <Alert.Title>{presentation.title}</Alert.Title>
        <Alert.Description whiteSpace="pre-line">{presentation.description}</Alert.Description>
        {presentation.kind === "billing" ? (
          <Button type="button" mt={3} size="xs" variant="outline" onClick={onOpenBillingSettings}>
            {presentation.actionLabel}
          </Button>
        ) : null}
      </Alert.Content>
    </Alert.Root>
  );
}

function getPresentation(
  resolution: PeopleCapacityResolution,
  retryActionLabel: string,
  canOpenBillingSettings: boolean,
) {
  switch (resolution.kind) {
    case "choosePaidPlan":
      if (!canOpenBillingSettings) return getLimitReachedPresentation(resolution);

      return {
        kind: "billing" as const,
        title: "プランの変更が必要です",
        description: `現在の利用人数は${resolution.current}名（上限${resolution.max}名）です。\nプラン変更と支払い結果の確認が完了してから、改めて${retryActionLabel}してください。`,
        actionLabel: "プランと支払いを確認",
      };
    case "limitReached":
      return getLimitReachedPresentation(resolution);
  }
}

const getLimitReachedPresentation = (resolution: Pick<PeopleCapacityResolution, "current" | "max">) => ({
  kind: "information" as const,
  title: "プランの利用人数の上限に達しています",
  description: `現在の利用人数は${resolution.current}名（上限${resolution.max}名）です。\nこのプランでは、これ以上利用者を追加できません。`,
});

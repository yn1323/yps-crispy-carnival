import { Alert } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import { Button } from "@/src/components/ui/Button";
import type { PeopleCapacityResolution } from "@/src/domains/organizationBilling/peopleCapacity";
import { featureVisibilityAtom } from "@/src/stores/user";

type Props = {
  resolution: PeopleCapacityResolution;
  retryActionLabel: string;
  onOpenBillingSettings?: () => void;
};

export function PeopleCapacityResolutionAlert({ resolution, retryActionLabel, onOpenBillingSettings }: Props) {
  const featureVisibility = useAtomValue(featureVisibilityAtom);
  const presentation = getPresentation(
    resolution,
    retryActionLabel,
    featureVisibility.billing && onOpenBillingSettings !== undefined,
  );

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
        ) : (
          <Button asChild mt={3} size="xs" variant="outline">
            <a href={presentation.href}>{presentation.actionLabel}</a>
          </Button>
        )}
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
      if (!canOpenBillingSettings) return getContactPresentation(resolution);

      return {
        kind: "billing" as const,
        title: "Proへの変更が必要です",
        description: `現在の利用人数は${resolution.current}名（上限${resolution.max}名）です。\nProへの変更と支払い結果の確認が完了してから、改めて${retryActionLabel}してください。`,
        actionLabel: "プランと支払いを確認",
      };
    case "contact":
      return getContactPresentation(resolution);
  }
}

const getContactPresentation = (resolution: Pick<PeopleCapacityResolution, "current" | "max">) => ({
  kind: "contact" as const,
  title: "利用人数の上限に達しています",
  description: `現在の利用人数は${resolution.current}名（上限${resolution.max}名）です。\nこれ以上利用者を追加する場合はお問い合わせください。`,
  actionLabel: "利用上限について問い合わせる",
  href: "/contact",
});

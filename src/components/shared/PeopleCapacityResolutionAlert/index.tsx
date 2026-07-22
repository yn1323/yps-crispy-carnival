import { Alert } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";
import type { PeopleCapacityResolution } from "@/src/domains/organizationBilling/peopleCapacity";

type Props = {
  resolution: PeopleCapacityResolution;
  retryActionLabel: string;
};

export function PeopleCapacityResolutionAlert({ resolution, retryActionLabel }: Props) {
  const presentation = getPresentation(resolution, retryActionLabel);

  return (
    <Alert.Root status="warning" alignItems="flex-start">
      <Alert.Indicator mt={1} />
      <Alert.Content>
        <Alert.Title>{presentation.title}</Alert.Title>
        <Alert.Description>{presentation.description}</Alert.Description>
        <Button asChild mt={3} size="xs" variant="outline">
          <a href={presentation.href}>{presentation.actionLabel}</a>
        </Button>
      </Alert.Content>
    </Alert.Root>
  );
}

function getPresentation(resolution: PeopleCapacityResolution, retryActionLabel: string) {
  switch (resolution.kind) {
    case "choosePaidPlan":
      return {
        title: "Proへの変更が必要です",
        description: `現在の利用状況は${resolution.current}名 / ${resolution.max}名です。Proへの変更と支払い結果の確認が完了してから、改めて${retryActionLabel}してください。`,
        actionLabel: "プランと支払いを確認",
        href: "/settings?tab=billing",
      };
    case "contact":
      return {
        title: "利用人数の上限に達しています",
        description: `現在の利用状況は${resolution.current}名 / ${resolution.max}名です。これ以上利用者を追加する場合はお問い合わせください。`,
        actionLabel: "利用上限について問い合わせる",
        href: "/contact",
      };
  }
}

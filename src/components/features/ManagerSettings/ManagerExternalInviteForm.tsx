import { Alert, Field, Flex, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import type { Id } from "@/convex/_generated/dataModel";
import { createExternalOrganizationManagerInvitationSchema } from "@/convex/organizationInvitation/schemas";
import { Button } from "@/src/components/ui/Button";
import type { ReadyManagerSettingsOverview } from "./types";
import { useManagerIssueController } from "./useManagerIssueController";

const managerExternalInviteFormSchema = createExternalOrganizationManagerInvitationSchema.pick({
  name: true,
  email: true,
});
type FormValues = z.infer<typeof managerExternalInviteFormSchema>;
const EMPTY_DEFAULT_VALUES: FormValues = { name: "", email: "" };

export function ManagerExternalInviteForm({
  overview,
  organizationId,
}: {
  overview: ReadyManagerSettingsOverview;
  organizationId: Id<"organizations">;
}) {
  const controller = useManagerIssueController({ overview, organizationId });

  return (
    <ManagerExternalInviteFormView
      isSubmitting={controller.isRunning}
      isReadOnly={!overview.actions.canInviteExternal}
      disabledReason={overview.actions.externalDisabledReason}
      onRequestInvite={controller.onRequestExternal}
    />
  );
}

export function ManagerExternalInviteFormView({
  isSubmitting,
  isReadOnly = false,
  disabledReason,
  defaultValues = EMPTY_DEFAULT_VALUES,
  formId,
  showSubmitAction = true,
  onRequestInvite,
}: {
  isSubmitting: boolean;
  isReadOnly?: boolean;
  disabledReason?: string;
  defaultValues?: FormValues;
  formId?: string;
  showSubmitAction?: boolean;
  onRequestInvite: (invitedName: string, email: string) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(managerExternalInviteFormSchema),
    defaultValues,
  });

  return (
    <form
      id={formId}
      noValidate
      onSubmit={handleSubmit((values) => onRequestInvite(values.name.trim(), values.email.trim()))}
    >
      <Stack gap={5} maxW="640px" w="full">
        <Stack gap={1}>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            組織、店舗にいないユーザーを招待します。
          </Text>
        </Stack>
        {isReadOnly && disabledReason && (
          <Alert.Root status="warning" borderRadius="lg" alignItems="flex-start">
            <Alert.Indicator mt={1} />
            <Alert.Content>
              <Alert.Title>新しい管理者を招待できません</Alert.Title>
              <Alert.Description>{disabledReason}</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
        <Field.Root required invalid={Boolean(errors.name)}>
          <Field.Label>名前</Field.Label>
          <Input
            autoComplete="name"
            placeholder="例：山田 太郎"
            disabled={isSubmitting || isReadOnly}
            {...register("name")}
          />
          <Field.ErrorText>{errors.name?.message}</Field.ErrorText>
        </Field.Root>
        <Field.Root required invalid={Boolean(errors.email)}>
          <Field.Label>メールアドレス</Field.Label>
          <Input
            type="email"
            autoComplete="email"
            placeholder="例：yamada@example.com"
            disabled={isSubmitting || isReadOnly}
            {...register("email")}
          />
          <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
        </Field.Root>
        {showSubmitAction && (
          <Flex justify="flex-end">
            <Button
              type="submit"
              colorPalette="teal"
              minH="44px"
              w={{ base: "full", md: "auto" }}
              minW={{ md: "208px" }}
              loading={isSubmitting}
              disabled={isReadOnly}
            >
              招待する
            </Button>
          </Flex>
        )}
      </Stack>
    </form>
  );
}

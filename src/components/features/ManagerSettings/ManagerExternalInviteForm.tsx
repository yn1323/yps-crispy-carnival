import { Field, Flex, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { createExternalOrganizationManagerInvitationSchema } from "@/convex/organizationInvitation/schemas";
import { Button } from "@/src/components/ui/Button";
import { ManagerIssueConfirmationDialog } from "./ManagerIssueConfirmationDialog";
import type { ReadyManagerSettingsOverview } from "./types";
import { useManagerIssueController } from "./useManagerIssueController";

const managerExternalInviteFormSchema = createExternalOrganizationManagerInvitationSchema.pick({
  name: true,
  email: true,
});
type FormValues = z.infer<typeof managerExternalInviteFormSchema>;

export function ManagerExternalInviteForm({
  overview,
  shopId,
}: {
  overview: ReadyManagerSettingsOverview;
  shopId: string;
}) {
  const controller = useManagerIssueController({ overview, shopId });

  return (
    <>
      <ManagerExternalInviteFormView
        isSubmitting={controller.isRunning}
        onRequestInvite={controller.onRequestExternal}
      />
      <ManagerIssueConfirmationDialog
        confirmation={controller.confirmation}
        isRunning={controller.isRunning}
        onClose={controller.onCloseConfirmation}
        onConfirm={controller.onConfirm}
      />
    </>
  );
}

export function ManagerExternalInviteFormView({
  isSubmitting,
  onRequestInvite,
}: {
  isSubmitting: boolean;
  onRequestInvite: (invitedName: string, email: string) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(managerExternalInviteFormSchema),
    defaultValues: { name: "", email: "" },
  });

  return (
    <Stack
      as="form"
      gap={5}
      maxW="640px"
      w="full"
      onSubmit={handleSubmit((values) => onRequestInvite(values.name.trim(), values.email.trim()))}
    >
      <Stack gap={1}>
        <Text as="h2" fontSize="lg" fontWeight="semibold" color="gray.900">
          招待する方の情報
        </Text>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          経営者や本部担当者など、組織に未登録の方をメールで招待します。
        </Text>
      </Stack>
      <Field.Root required invalid={Boolean(errors.name)}>
        <Field.Label>氏名</Field.Label>
        <Input autoComplete="name" disabled={isSubmitting} {...register("name")} />
        <Field.ErrorText>{errors.name?.message}</Field.ErrorText>
      </Field.Root>
      <Field.Root required invalid={Boolean(errors.email)}>
        <Field.Label>メールアドレス</Field.Label>
        <Input type="email" autoComplete="email" disabled={isSubmitting} {...register("email")} />
        <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
      </Field.Root>
      <Flex justify="flex-end">
        <Button
          type="submit"
          colorPalette="teal"
          minH="44px"
          w={{ base: "full", md: "auto" }}
          minW={{ md: "208px" }}
          loading={isSubmitting}
        >
          招待内容を確認する
        </Button>
      </Flex>
    </Stack>
  );
}

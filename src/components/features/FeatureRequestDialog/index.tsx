import { Field, Text, Textarea, VStack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useForm } from "react-hook-form";
import { LuMessageSquarePlus } from "react-icons/lu";
import { z } from "zod";
import type { Id } from "@/convex/_generated/dataModel";
import { FEATURE_REQUEST_COMMENT_MAX_LENGTH } from "@/convex/constants";
import { featureRequestCommentSchema } from "@/convex/featureRequest/schemas";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { showErrorToast, showSuccessToast } from "@/src/components/ui/toaster";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";

const formSchema = z.object({ comment: featureRequestCommentSchema });
type FormData = z.infer<typeof formSchema>;

const submitFeatureRequestRef = makeFunctionReference<
  "mutation",
  { comment: string; requestId: string; shopId?: Id<"shops"> },
  { status: "accepted" }
>("featureRequest/mutations:submit");

const submitStaffFeatureRequestRef = makeFunctionReference<
  "mutation",
  { comment: string; requestId: string; sessionToken: string; accessKind: "submit" },
  { status: "accepted" }
>("featureRequest/mutations:submitFromStaff");

type FeatureRequestDialogProps = {
  onSubmit: (data: { comment: string; requestId: string }) => Promise<void>;
};

export function FeatureRequestDialog({ onSubmit }: FeatureRequestDialogProps) {
  const dialog = useDialog();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(formSchema), defaultValues: { comment: "" } });
  const commentLength = watch("comment").length;
  const { run: submitOnce, isRunning } = useSingleFlight(async (values: FormData) => {
    try {
      await onSubmit({ comment: values.comment, requestId: crypto.randomUUID() });
      reset();
      dialog.close();
      showSuccessToast({ title: "要望を受け付けました" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const close = () => {
    reset();
    dialog.close();
  };

  return (
    <>
      <Button
        display={{ base: "none", md: "inline-flex" }}
        size="sm"
        variant="ghost"
        colorPalette="gray"
        onClick={dialog.open}
      >
        <LuMessageSquarePlus aria-hidden />
        要望を送る
      </Button>
      <IconButton
        aria-label="要望を送る"
        title="要望を送る"
        display={{ base: "inline-flex", md: "none" }}
        size="sm"
        variant="ghost"
        colorPalette="gray"
        onClick={dialog.open}
      >
        <LuMessageSquarePlus aria-hidden />
      </IconButton>

      <Dialog
        title="要望を送る"
        isOpen={dialog.isOpen}
        onOpenChange={(details) => {
          if (details.open) dialog.open();
          else close();
        }}
        onClose={close}
        formId="feature-request-form"
        submitLabel="要望を送る"
        isLoading={isRunning}
        maxW={{ base: "calc(100vw - 32px)", md: "448px" }}
        keyboardAwareViewport
      >
        <form id="feature-request-form" onSubmit={handleSubmit((values) => void submitOnce(values))} noValidate>
          <VStack align="stretch" gap={4}>
            <Text color="fg.muted" fontSize="sm" lineHeight="tall">
              いただいた内容は、今後の改善の参考にします。
            </Text>
            <Field.Root invalid={!!errors.comment}>
              <Field.Label>どんな機能や改善があるとうれしいですか？</Field.Label>
              <Textarea
                {...register("comment")}
                bg="white"
                minH="120px"
                maxLength={FEATURE_REQUEST_COMMENT_MAX_LENGTH}
                resize="vertical"
              />
              <Text alignSelf="flex-end" color="fg.muted" fontSize="xs">
                {commentLength}/{FEATURE_REQUEST_COMMENT_MAX_LENGTH}
              </Text>
              {errors.comment && <Field.ErrorText>{errors.comment.message}</Field.ErrorText>}
            </Field.Root>
          </VStack>
        </form>
      </Dialog>
    </>
  );
}

export function FeatureRequestAction() {
  const submit = useShopMutation(submitFeatureRequestRef);
  return <FeatureRequestDialog onSubmit={async (data) => void (await submit(data))} />;
}

export function StaffFeatureRequestAction({ sessionToken }: { sessionToken: string }) {
  const submit = useMutation(submitStaffFeatureRequestRef);
  return (
    <FeatureRequestDialog
      onSubmit={async (data) => void (await submit({ ...data, sessionToken, accessKind: "submit" }))}
    />
  );
}

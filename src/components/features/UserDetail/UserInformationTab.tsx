import { Box, Heading, Stack, Text } from "@chakra-ui/react";
import { useUser } from "@clerk/react";
import type { ReactNode } from "react";
import type { PersonProfileFormData } from "@/src/components/shared/PersonProfileForm";
import { PersonProfileForm } from "@/src/components/shared/PersonProfileForm";
import { Button } from "@/src/components/ui/Button";
import type { UserDetailData } from "./types";

type Props = {
  data: UserDetailData;
  formId: string;
  isReadOnly: boolean;
  managerSettings: ReactNode;
  onDirtyChange: (isDirty: boolean) => void;
  onOpenEmailChange: () => void;
  onUpdate: (data: PersonProfileFormData) => void | Promise<void>;
};

export function UserInformationTab({
  data,
  formId,
  isReadOnly,
  managerSettings,
  onDirtyChange,
  onOpenEmailChange,
  onUpdate,
}: Props) {
  const { isLoaded: isClerkLoaded, user } = useUser();
  const isLinked = data.person.hasLinkedAccount;
  const displayedEmail = data.isSelf
    ? isClerkLoaded
      ? (user?.primaryEmailAddress?.emailAddress ?? "メールアドレスを確認できません")
      : "メールアドレスを確認中"
    : data.person.email;

  return (
    <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
      <Box pb={6}>
        <Stack gap={5}>
          <Heading as="h2" fontSize="md" fontWeight="semibold" color="gray.900">
            ユーザー情報
          </Heading>
          <fieldset disabled={isReadOnly} style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}>
            <PersonProfileForm
              // 別管理者による更新が届いた場合は最新値を優先し、古い入力で上書きしない。
              key={`${data.person.id}:${data.person.name}:${data.person.email}`}
              formId={formId}
              initialValues={{ name: data.person.name, email: data.person.email }}
              emailField={isLinked ? "hidden" : "editable"}
              onDirtyChange={onDirtyChange}
              onSubmit={async (formData) => {
                await onUpdate(formData);
              }}
            />
          </fieldset>
          {isLinked && (
            <Stack gap={2}>
              <Text fontSize="sm" fontWeight="medium" color="gray.700">
                メールアドレス
              </Text>
              <Text>{displayedEmail}</Text>
              {data.isSelf ? (
                <Box>
                  <Button type="button" variant="outline" size="sm" onClick={onOpenEmailChange}>
                    メールアドレスを変更
                  </Button>
                </Box>
              ) : (
                <Text fontSize="sm" color="fg.muted">
                  アカウント連携済みのメールアドレスは、本人のみ変更できます。
                </Text>
              )}
            </Stack>
          )}
        </Stack>
      </Box>
      {managerSettings && <Box pt={6}>{managerSettings}</Box>}
    </Stack>
  );
}

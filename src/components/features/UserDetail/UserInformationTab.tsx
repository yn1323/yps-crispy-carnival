import { Box, Heading, Link, Stack } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { PersonProfileFormData } from "@/src/components/shared/PersonProfileForm";
import { PersonProfileForm } from "@/src/components/shared/PersonProfileForm";
import type { UserDetailData } from "./types";

type Props = {
  data: UserDetailData;
  formId: string;
  isReadOnly: boolean;
  managerSettings: ReactNode;
  onUpdate: (data: PersonProfileFormData) => void | Promise<void>;
};

export function UserInformationTab({ data, formId, isReadOnly, managerSettings, onUpdate }: Props) {
  const showLoginEmailGuidance = data.isSelf && data.managerRole !== "none";

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
              emailLabel="シフト連絡先メールアドレス"
              emailHelperText={
                showLoginEmailGuidance ? (
                  <>
                    シフト通知用先のメールアドレスです。
                    <br />
                    ログインで利用するメールは
                    <Link
                      asChild
                      color="teal.700"
                      fontWeight="semibold"
                      textDecoration="underline"
                      textUnderlineOffset="3px"
                    >
                      <RouterLink to="/account">アカウント設定</RouterLink>
                    </Link>
                    から設定してください。
                  </>
                ) : undefined
              }
              onSubmit={async (formData) => {
                await onUpdate(formData);
              }}
            />
          </fieldset>
        </Stack>
      </Box>
      {managerSettings && <Box pt={6}>{managerSettings}</Box>}
    </Stack>
  );
}

import { Button, Field, Icon, Input, VStack } from "@chakra-ui/react";
import { IoSaveSharp } from "react-icons/io5";
import { LuUser } from "react-icons/lu";
import { FormCard } from "@/src/components/ui/FormCard";

type UserProfileProps = {
  userName: string;
  email: string;
  onChangeUserName: (name: string) => void;
  onSave: () => void;
};

export const UserProfile = ({ userName, email, onChangeUserName, onSave }: UserProfileProps) => {
  return (
    <FormCard icon={LuUser} iconColor="gray.700" title="ユーザー設定">
      <VStack gap="4" align="stretch">
        <Field.Root>
          <Field.Label>名前</Field.Label>
          <Input value={userName} onChange={(e) => onChangeUserName(e.target.value)} placeholder="名前を入力" />
          <Field.HelperText>店舗名称は各店舗の設定から修正してください</Field.HelperText>
        </Field.Root>
        <Field.Root>
          <Field.Label>メールアドレス</Field.Label>
          <Input value={email} disabled bg="gray.50" />
          <Field.HelperText>メールアドレスは変更できません</Field.HelperText>
        </Field.Root>
        <Button onClick={onSave} w="full" colorPalette="teal" gap="2">
          <Icon as={IoSaveSharp} boxSize={4} />
          変更を保存
        </Button>
      </VStack>
    </FormCard>
  );
};

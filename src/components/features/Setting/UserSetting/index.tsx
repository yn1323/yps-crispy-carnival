import { Container, VStack } from "@chakra-ui/react";
import { useMutation } from "convex/react";
import { useSetAtom } from "jotai";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Title } from "@/src/components/ui/Title";
import { toaster } from "@/src/components/ui/toaster";
import { userAtom } from "@/src/stores/user";
import { ShopSetting } from "./ShopSetting";
import { UserProfile } from "./UserProfile";

// モックデータ（店舗関連は後で置き換え）
const mockStores = [
  { id: "1", name: "本店" },
  { id: "2", name: "駅前店" },
  { id: "3", name: "ショッピングモール店" },
];

const mockShiftTemplateCounts: Record<string, number> = {
  "1": 3,
  "2": 2,
  "3": 0,
};

type UserSettingProps = {
  user: Doc<"users">;
};

export const UserSetting = ({ user }: UserSettingProps) => {
  const [userName, setUserName] = useState(user.name);
  const setUserAtom = useSetAtom(userAtom);
  const updateUser = useMutation(api.user.mutations.update);

  const selectedStoreId = "1";
  const selectedStore = mockStores.find((s) => s.id === selectedStoreId);
  const templateCount = mockShiftTemplateCounts[selectedStoreId] || 0;

  const handleSaveUserName = async () => {
    try {
      await updateUser({
        id: user._id,
        name: userName,
      });

      // userAtomも同期
      setUserAtom((prev) => ({
        ...prev,
        name: userName,
      }));

      toaster.create({
        description: "ユーザー名を更新しました",
        type: "success",
      });
    } catch {
      toaster.create({
        description: "ユーザー名の更新に失敗しました",
        type: "error",
      });
    }
  };

  return (
    <Container maxW="6xl" p={{ base: 4, md: 8 }}>
      <Title>個人設定</Title>

      <VStack gap="6" align="stretch">
        <UserProfile
          userName={userName}
          email={user.email}
          onChangeUserName={setUserName}
          onSave={handleSaveUserName}
        />

        <ShopSetting storeName={selectedStore?.name ?? ""} templateCount={templateCount} />
      </VStack>
    </Container>
  );
};

import { Box, Button, Heading, Icon, Spinner, Stack, Text, VStack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useAtom } from "jotai";
import { type SubmitHandler, useForm } from "react-hook-form";
import { LuStore } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { toaster } from "@/src/components/ui/toaster";
import { userAtom } from "@/src/stores/user";
import { ShopForm } from "../ShopForm";
import { type SchemaType, schema, submitFrequencyOptions, timeUnitOptions } from "./schema";

type Props = {
  shop: Doc<"shops"> | null | undefined;
  userRole: string | null | undefined;
  callbackRoutingPath?: string;
};

type ShopEditFormProps = {
  shop: Doc<"shops">;
  callbackRoutingPath?: string;
};

const ShopEditForm = ({ shop, callbackRoutingPath }: ShopEditFormProps) => {
  const navigate = useNavigate();
  const [user] = useAtom(userAtom);
  const updateShop = useMutation(api.shop.updateShop);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SchemaType>({
    resolver: zodResolver(schema),
    defaultValues: {
      shopName: shop.shopName,
      openTime: shop.openTime,
      closeTime: shop.closeTime,
      timeUnit: String(shop.timeUnit),
      submitFrequency: shop.submitFrequency,
      useTimeCard: shop.useTimeCard,
      description: shop.description ?? "",
    },
  });

  const onSubmit: SubmitHandler<SchemaType> = async (data) => {
    if (!user.authId) {
      toaster.create({
        description: "ログインが必要です",
        type: "error",
      });
      return;
    }

    try {
      await updateShop({
        shopId: shop._id,
        authId: user.authId,
        shopName: data.shopName,
        openTime: data.openTime,
        closeTime: data.closeTime,
        timeUnit: data.timeUnit ? Number(data.timeUnit) : 15,
        submitFrequency: data.submitFrequency,
        useTimeCard: data.useTimeCard,
        description: data.description,
      });

      toaster.create({
        description: "店舗情報を更新しました",
        type: "success",
      });
      navigate({ to: callbackRoutingPath ?? `/shops/${shop._id}` });
    } catch (error) {
      console.error("店舗更新エラー:", error);
      toaster.create({
        description: "店舗情報の更新に失敗しました",
        type: "error",
      });
    }
  };

  return (
    <ShopForm
      mode="edit"
      register={register}
      errors={errors}
      watch={watch}
      setValue={setValue}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit(onSubmit)}
    />
  );
};

export const ShopEdit = ({ shop, userRole, callbackRoutingPath }: Props) => {
  // ローディング処理
  if (shop === undefined || userRole === undefined) {
    return <ShopEditLoading />;
  }

  // 店舗なし処理
  if (shop === null) {
    return <ShopEditNotFound />;
  }

  // 権限チェック
  if (userRole !== "owner" && userRole !== "manager") {
    return <ShopEditUnauthorized />;
  }

  return <ShopEditForm shop={shop} callbackRoutingPath={callbackRoutingPath} />;
};

export const ShopEditLoading = () => {
  return (
    <Box display="flex" justifyContent="center" alignItems="center" minH="400px">
      <VStack gap="4">
        <Spinner size="xl" color="teal.500" />
        <Text color="fg.muted">読み込み中...</Text>
      </VStack>
    </Box>
  );
};

export const ShopEditNotFound = () => {
  return (
    <Box textAlign="center" py="20">
      <Stack gap="6" alignItems="center">
        <Box fontSize="6xl" color="fg.muted">
          <Icon as={LuStore} boxSize={12} />
        </Box>
        <Heading size="lg" color="fg.muted">
          店舗が見つかりません
        </Heading>
        <Text color="fg.muted">指定された店舗は存在しないか、削除された可能性があります</Text>
        <Link to="/shops">
          <Button colorPalette="teal" size="lg">
            店舗一覧に戻る
          </Button>
        </Link>
      </Stack>
    </Box>
  );
};

export const ShopEditUnauthorized = () => {
  return (
    <Box textAlign="center" py="20">
      <Stack gap="6" alignItems="center">
        <Heading size="lg" color="red.500">
          アクセス権限がありません
        </Heading>
        <Text color="fg.muted">この店舗を編集する権限がありません</Text>
        <Text color="fg.muted" fontSize="sm">
          オーナーまたはマネージャーのみが店舗情報を編集できます
        </Text>
        <Link to="/shops">
          <Button colorPalette="teal" size="lg">
            店舗一覧に戻る
          </Button>
        </Link>
      </Stack>
    </Box>
  );
};

// submitFrequencyOptions と timeUnitOptions のエクスポート（既存コードとの互換性のため）
export { submitFrequencyOptions, timeUnitOptions };

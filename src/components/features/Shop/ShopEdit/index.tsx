import { Box, Button, Container, Flex, Heading, Icon, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useAtomValue } from "jotai";
import { type SubmitHandler, useForm } from "react-hook-form";
import { LuStore } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Empty } from "@/src/components/ui/Empty";
import { LoadingState } from "@/src/components/ui/LoadingState";
import { Title } from "@/src/components/ui/Title";
import { toaster } from "@/src/components/ui/toaster";
import { userAtom } from "@/src/stores/user";
import { ShopForm } from "../ShopForm";
import { type SchemaType, schema } from "../ShopForm/schema";

type Props = {
  shop: Doc<"shops"> | null | undefined;
  callbackRoutingPath?: string;
};

type ShopEditFormProps = {
  shop: Doc<"shops">;
  callbackRoutingPath?: string;
};

const ShopEditForm = ({ shop, callbackRoutingPath }: ShopEditFormProps) => {
  const navigate = useNavigate();
  const user = useAtomValue(userAtom);
  const updateShop = useMutation(api.shop.mutations.update);
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
        description: data.description,
      });

      toaster.create({
        description: "店舗情報を更新しました",
        type: "success",
      });
      navigate({ to: callbackRoutingPath ?? `/shops/${shop._id}` });
    } catch {
      toaster.create({
        description: "店舗情報の更新に失敗しました",
        type: "error",
      });
    }
  };

  return (
    <Container maxW="6xl">
      <Title prev={{ url: `/shops/${shop._id}`, label: "店舗詳細に戻る" }}>
        <Flex align="center" gap={3}>
          <Flex p={{ base: 2, md: 3 }} bg="teal.50" borderRadius="lg">
            <Icon as={LuStore} boxSize={6} color="teal.600" />
          </Flex>
          <Heading as="h2" size="xl" color="gray.900">
            店舗編集
          </Heading>
        </Flex>
      </Title>
      <ShopForm
        mode="edit"
        register={register}
        errors={errors}
        watch={watch}
        setValue={setValue}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit(onSubmit)}
      />
    </Container>
  );
};

export const ShopEdit = ({ shop, callbackRoutingPath }: Props) => {
  // ローディング処理
  if (shop === undefined) {
    return <ShopEditLoading />;
  }

  // 店舗なし処理
  if (shop === null) {
    return <ShopEditNotFound />;
  }

  return <ShopEditForm shop={shop} callbackRoutingPath={callbackRoutingPath} />;
};

export const ShopEditLoading = () => {
  return <LoadingState />;
};

export const ShopEditNotFound = () => (
  <Empty
    icon={LuStore}
    title="店舗が見つかりません"
    description="指定された店舗は存在しないか、削除された可能性があります"
    action={
      <Link to="/shops">
        <Button colorPalette="teal" size="lg">
          店舗一覧に戻る
        </Button>
      </Link>
    }
  />
);

export const ShopEditUnauthorized = () => {
  return (
    <Box textAlign="center" py="20">
      <Stack gap="6" alignItems="center">
        <Heading size="lg" color="red.500">
          アクセス権限がありません
        </Heading>
        <Text color="fg.muted">この店舗を編集する権限がありません</Text>
        <Text color="fg.muted" fontSize="sm">
          店舗オーナーのみが店舗情報を編集できます
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

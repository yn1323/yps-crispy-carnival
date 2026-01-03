import { Container, Flex, Heading, Icon } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useAtomValue } from "jotai";
import { type SubmitHandler, useForm } from "react-hook-form";
import { LuStore } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import { Title } from "@/src/components/ui/Title";
import { toaster } from "@/src/components/ui/toaster";
import { DEFAULT_POSITIONS } from "@/src/constants/validations";
import { userAtom } from "@/src/stores/user";
import { ShopForm } from "../ShopForm";
import { type SchemaType, schema } from "../ShopForm/schema";

type Props = {
  callbackRoutingPath?: string;
};

export const ShopRegister = ({ callbackRoutingPath }: Props) => {
  const navigate = useNavigate();
  const user = useAtomValue(userAtom);
  const createShop = useMutation(api.shop.mutations.create);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SchemaType>({
    resolver: zodResolver(schema),
    defaultValues: {
      openTime: "09:00",
      closeTime: "22:00",
      timeUnit: "30",
      submitFrequency: "2w",
      positions: DEFAULT_POSITIONS.map((name, index) => ({
        id: crypto.randomUUID(),
        name,
        order: index,
      })),
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
      const result = await createShop({
        shopName: data.shopName,
        openTime: data.openTime,
        closeTime: data.closeTime,
        timeUnit: data.timeUnit ? Number(data.timeUnit) : 15,
        submitFrequency: data.submitFrequency,
        description: data.description,
        authId: user.authId,
        positions: data.positions?.map((p) => ({
          name: p.name,
          order: p.order,
        })),
      });

      if (result.success) {
        toaster.create({
          description: "店舗登録が完了しました",
          type: "success",
        });
        navigate({ to: callbackRoutingPath ?? "/shops" });
      }
    } catch {
      toaster.create({
        description: "店舗登録に失敗しました",
        type: "error",
      });
    }
  };

  return (
    <Container maxW="6xl">
      <Title prev={{ url: "/shops", label: "店舗一覧に戻る" }}>
        <Flex align="center" gap={3}>
          <Flex p={{ base: 2, md: 3 }} bg="teal.50" borderRadius="lg">
            <Icon as={LuStore} boxSize={6} color="teal.600" />
          </Flex>
          <Heading as="h2" size="xl" color="gray.900">
            店舗登録
          </Heading>
        </Flex>
      </Title>
      <ShopForm
        mode="create"
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

import { zodResolver } from "@hookform/resolvers/zod";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useForm } from "react-hook-form";
import { ShopForm } from "./index";
import { type SchemaType, schema } from "./schema";

const meta: Meta<typeof ShopForm> = {
  title: "features/Shop/ShopForm",
  component: ShopForm,
};

export default meta;
type Story = StoryObj<typeof ShopForm>;

// 登録モード（デフォルト値あり）
export const CreateMode: Story = {
  render: () => {
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
        useTimeCard: true,
      },
    });

    const onSubmit = (data: SchemaType) => {
      console.log("Create:", data);
    };

    return (
      <ShopForm
        mode="create"
        register={register}
        errors={errors}
        watch={watch}
        setValue={setValue}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit(onSubmit)}
      />
    );
  },
};

// 編集モード（既存データあり）
export const EditMode: Story = {
  render: () => {
    const {
      register,
      handleSubmit,
      watch,
      setValue,
      formState: { errors, isSubmitting },
    } = useForm<SchemaType>({
      resolver: zodResolver(schema),
      defaultValues: {
        shopName: "カフェ新宿店",
        openTime: "10:00",
        closeTime: "22:00",
        timeUnit: "15",
        submitFrequency: "1w",
        useTimeCard: true,
        description: "レジ締め時は必ず2名で確認すること。緊急時の連絡先: 03-1234-5678",
      },
    });

    const onSubmit = (data: SchemaType) => {
      console.log("Edit:", data);
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
  },
};

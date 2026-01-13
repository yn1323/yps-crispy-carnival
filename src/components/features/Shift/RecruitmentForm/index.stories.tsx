import { zodResolver } from "@hookform/resolvers/zod";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useForm } from "react-hook-form";
import { RecruitmentForm } from "./index";
import { type RecruitmentFormSchemaType, recruitmentFormSchema } from "./schema";

const meta: Meta<typeof RecruitmentForm> = {
  title: "features/Shift/RecruitmentForm",
  component: RecruitmentForm,
};

export default meta;
type Story = StoryObj<typeof RecruitmentForm>;

export const Basic: Story = {
  render: () => {
    const {
      register,
      handleSubmit,
      formState: { errors, isSubmitting },
    } = useForm<RecruitmentFormSchemaType>({
      resolver: zodResolver(recruitmentFormSchema),
    });

    const onSubmit = (data: RecruitmentFormSchemaType) => {
      console.log("Submit:", data);
    };

    return (
      <RecruitmentForm
        register={register}
        errors={errors}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit(onSubmit)}
      />
    );
  },
};

export const WithDefaultValues: Story = {
  render: () => {
    const {
      register,
      handleSubmit,
      formState: { errors, isSubmitting },
    } = useForm<RecruitmentFormSchemaType>({
      resolver: zodResolver(recruitmentFormSchema),
      defaultValues: {
        startDate: "2025-12-01",
        endDate: "2025-12-07",
        deadline: "2025-11-25",
      },
    });

    const onSubmit = (data: RecruitmentFormSchemaType) => {
      console.log("Submit:", data);
    };

    return (
      <RecruitmentForm
        register={register}
        errors={errors}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit(onSubmit)}
      />
    );
  },
};

import { Field, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { Select } from "@/src/components/ui/Select";
import { minutesToTime, type Step1Data, step1Schema, timeToMinutes } from "./index";

type Props = {
  defaultValues?: Step1Data;
  onNext: (data: Step1Data) => void;
};

function generateTimeOptions(maxMinutes: number): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let m = 0; m <= maxMinutes; m += 30) {
    const value = minutesToTime(m);
    if (m >= 24 * 60) {
      const displayH = Math.floor(m / 60) - 24;
      const displayM = m % 60;
      options.push({
        value,
        label: `翌 ${displayH.toString().padStart(2, "0")}:${displayM.toString().padStart(2, "0")}`,
      });
    } else {
      options.push({ value, label: value });
    }
  }
  return options;
}

const ALL_START_OPTIONS = generateTimeOptions(23 * 60 + 30);
const ALL_END_OPTIONS = generateTimeOptions(29 * 60);

export const SetupStep1 = ({ defaultValues, onNext }: Props) => {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: defaultValues ?? { shopName: "", shiftStartTime: "", shiftEndTime: "" },
  });

  const startTime = watch("shiftStartTime");
  const endTime = watch("shiftEndTime");

  const endTimeOptions = useMemo(() => {
    if (!startTime) return ALL_END_OPTIONS;
    const startMin = timeToMinutes(startTime);
    return ALL_END_OPTIONS.filter((opt) => timeToMinutes(opt.value) > startMin);
  }, [startTime]);

  const startTimeOptions = useMemo(() => {
    if (!endTime) return ALL_START_OPTIONS;
    const endMin = timeToMinutes(endTime);
    return ALL_START_OPTIONS.filter((opt) => timeToMinutes(opt.value) < endMin);
  }, [endTime]);

  return (
    <form id="setup-step1" onSubmit={handleSubmit(onNext)}>
      <Stack gap={5}>
        <Field.Root invalid={!!errors.shopName}>
          <Field.Label>店舗名</Field.Label>
          <Input placeholder="例：居酒屋たなか" {...register("shopName")} />
          {errors.shopName && <Field.ErrorText>{errors.shopName.message}</Field.ErrorText>}
        </Field.Root>
        <Stack gap={3}>
          <Stack direction={{ base: "column", lg: "row" }} gap={3}>
            <Field.Root invalid={!!errors.shiftStartTime}>
              <Select
                label="シフト開始時間"
                items={startTimeOptions}
                value={startTime}
                onChange={(value) => setValue("shiftStartTime", value, { shouldValidate: true })}
                placeholder="選択してください"
                usePortal={false}
              />
              {errors.shiftStartTime && <Field.ErrorText>{errors.shiftStartTime.message}</Field.ErrorText>}
            </Field.Root>
            <Field.Root invalid={!!errors.shiftEndTime}>
              <Select
                label="シフト終了時間"
                items={endTimeOptions}
                value={endTime}
                onChange={(value) => setValue("shiftEndTime", value, { shouldValidate: true })}
                placeholder="選択してください"
                usePortal={false}
              />
              {errors.shiftEndTime && <Field.ErrorText>{errors.shiftEndTime.message}</Field.ErrorText>}
            </Field.Root>
          </Stack>
          <Text fontSize="xs" color="fg.muted" lineHeight="tall">
            営業時間ではなく、仕込み・片付けを含めたスタッフが勤務する可能性のある時間帯を入力してください
          </Text>
        </Stack>
      </Stack>
    </form>
  );
};

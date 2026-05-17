import { Box, Field, Flex, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/src/components/ui/Button";
import { Select } from "@/src/components/ui/Select";
import { type EditShopFormData, editShopSchema, minutesToTime, type RegularClosedDay, timeToMinutes } from "./index";

type Props = {
  defaultValues: EditShopFormData;
  onSubmit: (data: EditShopFormData) => void;
};

const WEEKDAYS: { value: RegularClosedDay; label: string; ariaLabel: string }[] = [
  { value: "sun", label: "日", ariaLabel: "日曜日" },
  { value: "mon", label: "月", ariaLabel: "月曜日" },
  { value: "tue", label: "火", ariaLabel: "火曜日" },
  { value: "wed", label: "水", ariaLabel: "水曜日" },
  { value: "thu", label: "木", ariaLabel: "木曜日" },
  { value: "fri", label: "金", ariaLabel: "金曜日" },
  { value: "sat", label: "土", ariaLabel: "土曜日" },
];

const sortRegularClosedDays = (days: RegularClosedDay[]) =>
  WEEKDAYS.filter((day) => days.includes(day.value)).map((day) => day.value);

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

export const EditShopForm = ({ defaultValues, onSubmit }: Props) => {
  const [regularClosedDays, setRegularClosedDays] = useState<RegularClosedDay[]>(defaultValues.regularClosedDays);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EditShopFormData>({
    resolver: zodResolver(editShopSchema),
    defaultValues,
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

  const toggleRegularClosedDay = (day: RegularClosedDay) => {
    setRegularClosedDays((current) => {
      const next = current.includes(day) ? current.filter((value) => value !== day) : [...current, day];
      return sortRegularClosedDays(next);
    });
  };

  const selectedClosedDayLabels = WEEKDAYS.filter((day) => regularClosedDays.includes(day.value)).map(
    (day) => day.label,
  );

  return (
    <form
      id="edit-shop-form"
      noValidate
      onSubmit={handleSubmit((data) =>
        onSubmit({ ...data, regularClosedDays: sortRegularClosedDays(regularClosedDays) }),
      )}
    >
      <Stack gap={5}>
        <Field.Root invalid={!!errors.shopName}>
          <Field.Label>お店の名前</Field.Label>
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
            仕込みや片付けも含めて、スタッフが働く可能性のある時間を選んでください。あとから変更できます。
          </Text>
        </Stack>
        <Stack gap={3}>
          <Box>
            <Text fontSize="sm" fontWeight="medium" color="fg.default">
              定休日
            </Text>
            <Text mt={1} fontSize="xs" color="fg.muted" lineHeight="tall">
              決まった休みがある場合、選択してください。また、募集ごとに細かく調整することも可能です。
            </Text>
          </Box>
          <Flex gap={2} justify="space-between" align="center">
            {WEEKDAYS.map((day) => {
              const isClosed = regularClosedDays.includes(day.value);
              return (
                <Button
                  key={day.value}
                  type="button"
                  aria-label={`${day.ariaLabel}を${isClosed ? "定休日から外す" : "定休日にする"}`}
                  aria-pressed={isClosed}
                  w="44px"
                  h="44px"
                  minW="44px"
                  p={0}
                  borderRadius="full"
                  borderWidth={1}
                  borderColor={isClosed ? "gray.300" : "teal.600"}
                  bg={isClosed ? "gray.100" : "teal.600"}
                  color={isClosed ? "fg.muted" : "white"}
                  fontWeight="semibold"
                  onClick={() => toggleRegularClosedDay(day.value)}
                  _hover={{ bg: isClosed ? "gray.200" : "teal.700" }}
                >
                  {day.label}
                </Button>
              );
            })}
          </Flex>
          <Text fontSize="xs" color="fg.muted">
            {selectedClosedDayLabels.length > 0
              ? `定休日: ${selectedClosedDayLabels.join("・")}`
              : "定休日は未設定です"}
          </Text>
        </Stack>
      </Stack>
    </form>
  );
};

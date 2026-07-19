import { Flex, Stack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { type RegularClosedDay, regularClosedDaysSchema } from "@/convex/shop/schemas";
import { RegularClosedDaysField } from "@/src/components/shared/ShopSettingsFields";
import { Button } from "@/src/components/ui/Button";
import { sortRegularClosedDays, WEEKDAYS } from "./script";
import type { UpdateShopSetting } from "./types";

type Props = {
  shopId: string;
  regularClosedDays: RegularClosedDay[];
  labelledBy: string;
  disabled: boolean;
  isBusy: boolean;
  isUpdating: boolean;
  onUpdate: UpdateShopSetting;
};

const schema = z.object({ regularClosedDays: regularClosedDaysSchema });
type FormData = z.infer<typeof schema>;

export function ShopRegularClosedDaysSettingForm({
  shopId,
  regularClosedDays: initialRegularClosedDays,
  labelledBy,
  disabled,
  isBusy,
  isUpdating,
  onUpdate,
}: Props) {
  const {
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitted },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { regularClosedDays: initialRegularClosedDays },
  });
  const regularClosedDays = watch("regularClosedDays");
  const selectedLabels = WEEKDAYS.filter((day) => regularClosedDays.includes(day.value)).map((day) => day.label);

  const toggleDay = (day: RegularClosedDay) => {
    setValue(
      "regularClosedDays",
      sortRegularClosedDays(
        regularClosedDays.includes(day)
          ? regularClosedDays.filter((value) => value !== day)
          : [...regularClosedDays, day],
      ),
      { shouldDirty: true, shouldValidate: isSubmitted },
    );
  };

  return (
    <form
      id={`shop-detail-closed-days-${shopId}`}
      aria-labelledby={labelledBy}
      noValidate
      onSubmit={handleSubmit(async (data) => {
        await onUpdate({ kind: "regularClosedDays", regularClosedDays: data.regularClosedDays });
      })}
    >
      <fieldset disabled={disabled || isBusy} style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}>
        <Stack gap={5}>
          <RegularClosedDaysField
            summary={selectedLabels.length > 0 ? `毎週 ${selectedLabels.join("・")}` : "定休日なし"}
            options={WEEKDAYS.map((day) => ({
              ...day,
              isClosed: regularClosedDays.includes(day.value),
            }))}
            onToggle={toggleDay}
          />
          <Flex justify="flex-end">
            <Button type="submit" colorPalette="teal" loading={isUpdating}>
              定休日を更新
            </Button>
          </Flex>
        </Stack>
      </fieldset>
    </form>
  );
}

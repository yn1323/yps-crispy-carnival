import type { Id } from "@/convex/_generated/dataModel";
import { ShiftSetupView } from "./ShiftSetupView";
import type { ShiftSetupData } from "./types";
import { useShiftSetupController } from "./useShiftSetupController";

type ShiftSetupProps = {
  shopId: Id<"shops">;
  organizationId: Id<"organizations">;
  setup: ShiftSetupData;
};

export function ShiftSetup({ shopId, organizationId, setup }: ShiftSetupProps) {
  const controller = useShiftSetupController({ shopId, organizationId, setup });
  return <ShiftSetupView {...controller} />;
}

export { ShiftSetupSkeleton, ShiftSetupView } from "./ShiftSetupView";
export type { ShiftSetupData } from "./types";

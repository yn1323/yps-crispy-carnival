import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useRedeemLineToken() {
  return useAction(api.line.actions.redeemLineToken);
}

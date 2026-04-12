import { Button } from "@chakra-ui/react";
import type { ReactNode } from "react";
import type { PaginationStatus } from "../types";

type Props = {
  status: PaginationStatus;
  onLoadMore: () => void;
  icon: ReactNode;
  label: string;
};

export function LoadMoreButton({ status, onLoadMore, icon, label }: Props) {
  if (status === "Exhausted" || status === "LoadingFirstPage") return null;

  return (
    <Button variant="outline" size="sm" w="full" onClick={onLoadMore} loading={status === "LoadingMore"}>
      {status === "CanLoadMore" && icon}
      {label}
    </Button>
  );
}

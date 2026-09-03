import { Link, Stack } from "@chakra-ui/react";
import { LuTriangleAlert } from "react-icons/lu";
import { MeasurementLink } from "@/src/components/shared/MeasurementLink";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";

type Props = {
  title: string;
  onRetry: () => void;
  onReload?: () => void;
};

const reloadPage = () => window.location.reload();

export function DashboardSectionUnavailable({ title, onRetry, onReload = reloadPage }: Props) {
  return (
    <Empty
      icon={LuTriangleAlert}
      title={title}
      description="時間をおいて再試行してください。再試行しても表示できない場合は、ページを再読み込みしてください。"
      secondaryDescription={
        <>
          解消しない場合は、
          <Link asChild color="teal.700" textDecoration="underline">
            <MeasurementLink href="/contact">お問い合わせフォーム</MeasurementLink>
          </Link>
          からご連絡ください。
        </>
      }
      tone="danger"
      variant="section"
      action={
        <Stack direction={{ base: "column", sm: "row" }} gap={2} w={{ base: "full", sm: "auto" }}>
          <Button colorPalette="teal" onClick={onRetry}>
            再試行する
          </Button>
          <Button colorPalette="gray" variant="outline" onClick={onReload}>
            ページを再読み込みする
          </Button>
        </Stack>
      }
    />
  );
}

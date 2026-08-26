import { Box } from "@chakra-ui/react";
import { LuBuilding2, LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { ShiftoriLoading } from "@/src/components/ui/ShiftoriLoading";

export type AppOrganizationState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; reason: "inaccessible" | "query" };

type Props = {
  state: AppOrganizationState;
  onReload?: () => void;
  onChooseAvailableOrganization?: () => void;
};

const reloadPage = () => window.location.reload();

/** queryを開始せず、organization境界の画面状態だけを描画する。 */
export function AppOrganizationStateView({ state, onReload = reloadPage, onChooseAvailableOrganization }: Props) {
  if (state.kind === "loading") {
    return (
      <Box aria-label="組織情報を読み込み中" aria-busy="true">
        <ShiftoriLoading variant="section" message="Loading..." minH="420px" />
      </Box>
    );
  }

  if (state.kind === "empty") {
    return (
      <Empty
        icon={LuBuilding2}
        title="利用できる組織がありません"
        description={"組織への登録が完了していない可能性があります。\n担当者へ問い合わせて登録状況を確認してください。"}
        tone="neutral"
        minH="420px"
      />
    );
  }

  if (state.reason === "inaccessible") {
    return (
      <Empty
        icon={LuBuilding2}
        title="この組織を開けません"
        description={"組織が削除されたか、利用する権限がありません。\n利用できる組織を選び直してください。"}
        tone="warning"
        minH="420px"
        action={
          onChooseAvailableOrganization ? (
            <Button colorPalette="teal" onClick={onChooseAvailableOrganization}>
              組織を切り替える
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <Empty
      icon={LuTriangleAlert}
      title="組織情報を読み込めませんでした"
      description={"一時的な問題が発生しました。\n通信状況をご確認のうえ、もう一度お試しください。"}
      tone="danger"
      minH="420px"
      action={
        <Button colorPalette="teal" onClick={onReload}>
          再読み込みする
        </Button>
      }
    />
  );
}

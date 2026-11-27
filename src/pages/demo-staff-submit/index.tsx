import { HandsOnStaffSubmitDemo } from "@/src/components/features/Demo";

type Props = {
  /** 体験デモの募集の初日（YYYY-MM-DD）。体験デモの画面が、スマートフォンの枠へ読み込むときに渡す。 */
  periodStart?: string;
};

/** 体験デモのスマートフォンの枠に読み込む、スタッフの提出画面。単独では使わない。 */
export function DemoStaffSubmitRoutePage({ periodStart }: Props) {
  return <HandsOnStaffSubmitDemo periodStart={periodStart} />;
}

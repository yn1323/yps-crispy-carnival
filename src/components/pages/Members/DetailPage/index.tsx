import { MemberDetail } from "@/src/components/features/Member/MemberDetail";
import { TitleTemplate } from "@/src/components/templates/TitleTemplate";

type Props = {};

export const MembersDetailPage = ({}: Props) => {
  return (
    <TitleTemplate title="メンバー詳細">
      <MemberDetail />
    </TitleTemplate>
  );
};

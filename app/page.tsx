import { Top } from "@/src/components/features/Top";
import { Animation } from "@/src/components/templates/Animation";

export const metadata = {
  title: "YPS-Polar",
};

const TopPage = () => {
  return (
    <Animation>
      <Top />
    </Animation>
  );
};

export default TopPage;

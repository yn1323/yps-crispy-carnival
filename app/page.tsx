import Link from "next/link";
import { Animation } from "@/src/components/templates/Animation";

export const metadata = {
  title: "YPS-Polar",
};

export default async function Page() {
  return (
    <Animation>
      <h1 className="border text-gray-500">YPS-Polar</h1>
      <Link href="/signin">ログイン</Link>
    </Animation>
  );
}

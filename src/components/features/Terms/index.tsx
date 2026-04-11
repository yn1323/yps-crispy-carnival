import { Link } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { Body, BulletList, LegalPage, Section } from "@/src/components/features/LegalPage";

export function Terms(): ReactNode {
  return (
    <LegalPage title="利用規約" lastUpdated="2026年4月11日">
      <Body>本規約は、シフトリ（以下「本サービス」）の利用に関する条件を定めるものです。</Body>

      <Section title="1. サービス内容">
        <Body>
          本サービスは、小規模店舗向けのシフト管理ツールです。管理者がスタッフのシフト希望を収集し、シフトを作成・確定・通知する機能を提供します。
        </Body>
      </Section>

      <Section title="2. アルファ版について">
        <Body>
          本サービスは現在アルファ版として提供しています。予告なく機能の変更・追加・削除を行う場合があります。
        </Body>
      </Section>

      <Section title="3. アカウント">
        <Body>
          管理者は、正確な情報を登録し、アカウントを適切に管理する責任を負います。スタッフのメールアドレスは管理者の責任のもと登録してください。
        </Body>
      </Section>

      <Section title="4. 禁止事項">
        <Body>以下の行為を禁止します。</Body>
        <BulletList
          items={["本サービスの不正利用・妨害行為", "他者の個人情報を不正に収集する行為", "法令に違反する行為"]}
        />
      </Section>

      <Section title="5. 免責事項">
        <Body>
          本サービスの利用により生じた損害について、運営者は故意または重大な過失がある場合を除き責任を負いません。データの消失・サービスの中断について保証はいたしません。
        </Body>
      </Section>

      <Section title="6. サービスの変更・終了">
        <Body>運営者は、事前の通知なく本サービスの内容を変更、または提供を終了できます。</Body>
      </Section>

      <Section title="7. 規約の変更">
        <Body>本規約は必要に応じて変更する場合があります。変更後の規約は本ページに掲載した時点で効力を生じます。</Body>
      </Section>

      <Section title="8. お問い合わせ">
        <Body>本規約に関するお問い合わせは、以下のフォームからご連絡ください。</Body>
        {/* TODO: Google Form URL に差し替え */}
        <Link href="#" color="teal.700" fontSize={{ base: "14px", lg: "15px" }}>
          お問い合わせフォーム
        </Link>
      </Section>
    </LegalPage>
  );
}

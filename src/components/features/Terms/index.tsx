import { Link } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { getLegalDocumentsForAudience, type LegalAudience } from "@/convex/legal/documents";
import { Body, BulletList, LegalPage, Section } from "@/src/components/features/LegalPage";

type Props = {
  audience?: LegalAudience;
};

export function Terms({ audience = "manager" }: Props): ReactNode {
  const documents = getLegalDocumentsForAudience(audience);
  const isStaff = audience === "staff";
  const title = isStaff ? "スタッフ向け利用規約" : "管理ユーザー向け利用規約";

  return (
    <LegalPage title={title} lastUpdated="2026年5月9日">
      <Body>
        本規約は、シフト管理SaaS「シフトリ」の利用条件を定めるものです。
        {isStaff
          ? "スタッフの方は、所属店舗から案内されたシフト提出・通知確認のために本サービスを利用します。"
          : "管理ユーザーの方は、店舗のシフト募集、スタッフ管理、シフト確定通知のために本サービスを利用します。"}
      </Body>

      <Section title="1. サービス内容">
        <Body>
          本サービスは、店舗のシフト希望収集、シフト作成、確定シフト通知を支援するサービスです。
          {isStaff
            ? "スタッフは、アカウント登録なしで、店舗から送付されたリンクやLINE通知からシフト希望を提出できます。"
            : "管理ユーザーは、店舗情報・スタッフ情報・募集期間を登録し、シフト管理業務に利用できます。"}
        </Body>
      </Section>

      <Section title="2. 利用上の注意">
        <BulletList
          items={
            isStaff
              ? [
                  "店舗から案内された本人用リンクを第三者に共有しないでください。",
                  "シフト希望は、所属店舗が定める締切までに提出してください。",
                  "通知の受信設定やLINE連携の解除は、利用端末やLINE側の設定に従って行ってください。",
                ]
              : [
                  "スタッフの氏名・メールアドレスは、シフト管理に必要な範囲で正確に登録してください。",
                  "スタッフ本人の連絡先を登録する場合は、店舗の責任で本人に必要な説明を行ってください。",
                  "本サービスを不正利用、妨害行為、法令違反の目的で利用しないでください。",
                ]
          }
        />
      </Section>

      <Section title="3. 免責">
        <Body>
          本サービスは、シフト管理を補助するものであり、勤務条件・雇用契約・給与計算を確定するものではありません。サービスの中断、通知遅延、入力内容の誤りにより生じた損害について、運営者は法令上認められる範囲で責任を負いません。
        </Body>
      </Section>

      <Section title="4. 規約の変更">
        <Body>
          本規約は必要に応じて変更されることがあります。重要な変更がある場合、サービス画面または通知により再同意をお願いすることがあります。
        </Body>
      </Section>

      <Section title="5. 関連文書">
        <Body>
          個人情報の取り扱いについては
          <Link href={documents.privacy.path} color="teal.700">
            {documents.privacy.title}
          </Link>
          をご確認ください。
        </Body>
        <Body>文書バージョン: {documents.terms.version}</Body>
      </Section>
    </LegalPage>
  );
}

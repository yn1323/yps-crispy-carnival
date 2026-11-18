# メールの配信停止

## 目的

特定のメールアドレスへシフトリからメールを送らないようにする手順です。  
「心当たりのないメールが届いた」と申告を受けた場合など、宛先の誤登録が疑われるときに使います。

スタッフや組織人物のデータは書き換えません。  
配信を止めるアドレスだけを、専用のテーブル`emailSuppressions`へ登録します。

## 止まる範囲

| 対象 | 扱い |
|---|---|
| 登録したアドレス宛てのメール | 通知の種類や店舗に関係なく送らない |
| 登録より前に送信待ちへ入っていたメール | 送信の直前に取り消す |
| LINE通知 | 止めない |
| 問い合わせフォームから運営へ届くメール | 対象外（宛先は運営の固定アドレス） |

判定は送信待ちへ登録するときと、送信の直前の2回行います。  
取り消したメールには取り消しの理由として`recipient_suppressed`を記録します。

管理画面では対象のアドレスを持つスタッフに「メール配信停止」のラベルを表示します。  
表示する場所はDashboardのスタッフ一覧とスタッフ詳細です。

## 登録する

1. Convex Dashboardで対象のdeploymentを開く。
2. Dataから`emailSuppressions`を開き、ドキュメントを追加する。
3. 次の形で入力して保存する。

```json
{
  "emailNormalized": "someone@example.com",
  "note": "2026-11-18 受信者から誤登録の申告"
}
```

- `emailNormalized`には前後の空白を除いたアドレスをすべて小文字で入力する。大文字が混じると一致せず、配信は止まらない。
- `note`は任意の運用メモで、画面や通知には使わない。

保存した時点から有効になります。deployは要りません。

## 解除する

`emailSuppressions`から対象のドキュメントを削除します。  
削除した後に作られるメールから、通常どおり送ります。  
停止中に取り消したメールは、自動では再送しません。

## 注意

- Productionの変更は人が行う。AI AgentはProductionへ接続しない。
- メールアドレスは個人情報のため、Issue、Pull Request、ログへ書かない。
- localとDevelopmentで[開発用網羅シード](development-seed.md)を実行すると、`emailSuppressions`も空になる。実行した後は、必要なアドレスを登録し直す。
- 登録の前後で、`staffs`と`organizationPeople`は変わらない。アドレスの修正は、店舗の管理者がスタッフ詳細から行う。

## 関連ファイル

- `convex/schema.ts`：`emailSuppressions`テーブル
- `convex/_lib/emailSuppression.ts`：配信停止の判定
- `convex/notificationOutbox/mutations.ts`：送信可否の判定（`getNotificationEligibility`）

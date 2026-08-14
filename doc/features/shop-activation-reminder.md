# 店舗登録後の本番募集リマインダー

初回店舗登録から7日後17:00 JSTに、まだ本人以外のシフト対象スタッフが登録されていない店舗の、対象店舗にスタッフとして所属するactive managerへ本番募集作成を促すリマインダーを送ります。
既存店舗への backfill は行わず、店舗登録時に scheduled function を1本だけ予約します。

## 関連ファイル

- `convex/setup/mutations.ts` - 初回店舗登録完了時に7日後17:00 JSTの scheduled function を予約
- `convex/shopActivationReminder/queries.ts` - 発火時点の店舗・manager recipient・staff状態を再確認
- `convex/shopActivationReminder/actions.ts` - LINE / メールの振り分けと outbox enqueue
- `convex/shopActivationReminder/refs.ts` - 生成API更新前でも参照できる function reference
- `convex/notification/templates.ts` - メール / LINE 文面
- `convex/notificationOutbox/failureSuppress.ts` - failureInbox 抑止 context
- `src/devtools/NotificationPreview/ShopActivationReminder/index.stories.tsx` - メール / LINE 文面プレビュー

## 画面一覧

- なし

## API一覧

- `internal.shopActivationReminder.queries.getReminderTarget`
- `internal.shopActivationReminder.actions.sendReminder`

## 補足

- setup時点では outbox に入れず、7日後の発火時に必要な場合だけ outbox を作成する。
- activeな組織管理者と、同じ組織人物に紐づく対象店舗のactiveな正規staffを両方一意に解決できる人物だけを対象にする。
  対象が0人なら通知を送らない。
- 組織共通のLINE連携が有効かつ友だち状態ならLINEを優先し、未連携・友だち解除・Quota超過時は現在のシフト連絡先へメールで送る。
  LINE jobにはQuota超過時用の`fallbackEmail`を付ける。
  外部送信直前にも管理者権限、店舗所属、宛先を再確認する。
- メール / LINE のCTAは通知元店舗を `shop` クエリで指定したDashboard URLを使う。
- context は `shopActivationReminder.sendReminder`。配送イベントは残すが、失敗しても Dashboard の再送モーダルに出る `notificationFailureInbox` は作らない。

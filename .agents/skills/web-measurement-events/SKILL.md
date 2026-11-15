---
name: web-measurement-events
description: シフトリのWeb計測（GA4・GTM）のイベントやパラメータを追加・変更・削除するとき、コード、GTM定義、本番GTM container、GA4のカスタム定義の同期漏れを防ぐ。`trackProductEvent`、`src/domains/webMeasurement/`、`doc/manual/ga4-gtm-container.json`を触るときに使う。GA4の数値を読むだけの分析には使わない。
---

# Web計測のイベントを変更する

アプリがdataLayerへイベントを送っても、本番GTM containerに同名のタグがなければGA4へ届かない。
リポジトリの変更だけで終えて、本番で計測されない状態を防ぐ。

## 正本を確認する

1. `doc/features/web-measurement.md`の「Event contract」と「識別子」を読む。
2. `doc/manual/ga4-gtm.md`を読む。GTM container、GA4 property、反映後の確認の正本である。
3. `src/domains/webMeasurement/events.ts`と、近いイベントの送信箇所を読む。

送ってよい値の範囲は`doc/features/web-measurement.md`を正本とし、このSkillでは繰り返さない。

## リポジトリを同期する

イベントまたはパラメータを変えた場合は、次を同じ変更に含める。

- `src/domains/webMeasurement/events.ts`のevent unionとserializer、`events.test.ts`
- `doc/manual/ga4-gtm-container.json`のタグ`GA4 - <イベント名>`とトリガー`CE - <イベント名>`。  新しいパラメータには変数`DLV - <パラメータ名>`も追加する
- `doc/features/web-measurement.md`のイベント表
- 新しいパラメータを追加した場合は、`doc/manual/ga4-gtm.md`の「カスタム定義」の表

## 本番GTMへ反映する

リポジトリの検証が終わったら、ブラウザ操作ツールで本番container `GTM-P22XCGTD`へ反映し、公開まで行う。
手順は`doc/manual/ga4-gtm.md`の「インポート手順」を正本とする。
アプリの反映より先に公開してよい理由も同じ文書にある。

エージェントが操作する場合は、次を守る。

1. Googleへのログインと、インポートするファイルの選択はユーザーへ依頼する。
   ファイル選択ダイアログはエージェントから操作できないため、`ga4-gtm-container.json`の絶対パスを伝える。
2. インポート前に、ワークスペースの未公開の変更を確認する。
   今回の変更と関係しない未公開の変更がある場合は、公開に含めるかをユーザーへ確認する。
3. インポートのプレビューで、追加、更新、削除の件数が定義の差分と合うことを確認する。
   削除や想定外の更新がある場合は、取り込まずにユーザーへ報告する。
4. 取り込み後のタグ一覧で、同名のタグが重複していないこと、`GA4 - Google tag`が1件だけであること、Clarityのタグが残っていることを確認する。
5. 変更内容が分かるバージョン名を付け、説明に戻し先のバージョン番号を書いて公開する。
6. 公開後、配信中の`gtm.js`に追加したイベント名が含まれることと、GA4のリアルタイムレポートに届くことを確認する。
   アクセスがなく受信を確認できない場合は、未確認として報告する。

ブラウザ操作は外部設定の反映に限り、アプリの動作確認には使わない。
Develop環境のcontainerは、`doc/manual/ga4-gtm.md`の「Develop環境」に従う。

## GA4 propertyを同期する

新しいパラメータを追加した場合は、GA4の「カスタム定義」へ登録する。
未登録のパラメータは、イベントが届いてもレポートの内訳に使えない。
登録する名前、スコープ、キーイベントにする条件は`doc/manual/ga4-gtm.md`の「GA4 propertyの設定」を正本とする。

## 記録する

公開した日時、GTMのバージョン、アプリのリリース、確認できた範囲を`doc/manual/release-status.md`へ記録する。
受信を確認していない項目を、確認済みとして書かない。

## 結果を報告する

- 追加・変更・削除したイベントとパラメータ
- 公開したGTMのバージョン番号と、戻し先のバージョン番号
- GA4に登録したカスタム定義
- 確認できたことと、未確認のこと
- ユーザーが行う残りの作業

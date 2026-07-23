# CI/CD運用

## この文書の範囲

この文書は、GitHub Actionsによる検証、プレビュー、リリースを人が確認するときの手順をまとめる。
実行条件、権限、環境変数、コマンドの現在値は `.github/workflows/` と `package.json` を正本とする。
この文書へsecretの値を記録しない。

## Pull Request

`develop` 向けPull Requestでは、ロジック、UI、Convex、型、lint、VRTなどの検証結果を確認する。
workflowの一覧と起動条件は `.github/workflows/` を確認する。

workflowの対象条件を満たす同一リポジトリからのPull Requestでは、`.github/workflows/deploy.yml` がConvex PreviewとCloudflare Pagesのプレビューを作成し、URLをPull Requestへ通知する。
Pull Requestを閉じると、同workflowがプレビューの後処理を行う。

認証付きE2Eは `.github/workflows/playwright.yml` が専用Convex Previewで実行する。
外部forkにはリポジトリのcredentialを渡さないため、同じ条件では実行されない。

VRTの差分とレポート公開は `.github/workflows/vrt.yml` が管理する。
差分承認の条件と承認環境はworkflowを確認し、レポートURLだけを根拠に成功扱いしない。

## `develop` への反映

`develop` へのpushでは、`.github/workflows/deploy.yml` がDevelop環境のConvex deploy、migration、build、prerender、Cloudflare Pages deployを順に実行する。
ビルド単体の確認は `.github/workflows/build.yml` も実行する。

失敗した場合は、失敗したjobとstepを特定し、同じcommit SHAに対する結果かを確認する。
環境のapproval待ち、secret不足、外部サービス障害と、コードの失敗を分けて扱う。

## Productionリリース

Productionリリースは、`main` 向けPull Requestをmergeしたときに `.github/workflows/release.yml` が判定する。
release label、version更新、tag、Convex deploy、migration、build、prerender、Cloudflare Pages deploy、GitHub Releaseの順序はworkflowを正とする。

merge前に次を確認する。

- 変更に対応する必須checkが成功している。
- 選択したrelease labelが意図するsemantic versioningの区分と一致する。
- Production環境のapprovalと必要なsecretが設定されている。
- schemaまたは保存済みデータ形式を変更した場合は、migration計画と復旧手順がある。

リリース後は、GitHub Release、production deployment、migration結果、主要導線を確認する。

## セキュリティ検証

`.github/workflows/security.yml` は、secret履歴、公開artifact、依存関係、CodeQLをイベント別に検査する。
検出を一時的に無効化して通すのではなく、検出対象、誤検知の根拠、代替の保証を確認する。

外部Action、permission、credentialを使うjobを変更するときは、`.github/AGENTS.md` の常設制約に従い、差分がその制約を満たすことを確認する。

## 失敗時の確認順

1. Pull Requestまたはcommitの最新SHAに対するjobか確認する。
2. 最初に失敗したstepとログを確認する。
3. 再現コマンドが `package.json` にある場合は、対象範囲を絞ってローカルで実行する。
4. Preview、Develop、Productionのどのenvironmentを使ったか確認する。
5. migration、deploy、report公開のような外部状態を伴う処理は、再実行前に現在状態を確認する。
6. workflowの修正が必要な場合は `.github/AGENTS.md` の安全制約に従う。

## 参照先

- `.github/workflows/`：workflowの実行条件、権限、job、step
- `.github/actions/`：共有setup Action
- `package.json`：ローカル検証コマンド
- `doc/rules/testing-strategy.md`：テスト層の責務
- `.github/AGENTS.md`：CI/CD変更時の常設制約

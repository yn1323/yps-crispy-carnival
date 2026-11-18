---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
---

# Assertionの完全性

「存在する」だけで十分か、「余計なものがない」「一意である」「禁止対象がない」まで契約かを先に決める。

- 完全性、対象集合、不在、一意性を守る場合、`arrayContaining`、`toContain`、`.some()`、`.find()`だけで終えない。
- `not.toEqual(expect.arrayContaining([A, B]))` は、AかBの片方が漏れていても通るため、不在確認には使わない。
- 先に対象範囲をfilterし、契約fieldへ射影してsortし、`toEqual`と`toHaveLength`で完全一致させる。
- scheduler、outbox、link、sessionは`.find()`や`hasScheduledJob()`だけだと重複を見逃す。対象をfilterして0件または1件を明示する。
- public DTOは原則`toEqual`で固定する。DB documentのmetadataが不安定な場合は、安定fieldへ射影してから比較し、必要な箇所だけ`toMatchObject`を使う。
- `record?.field`を`toBeUndefined`、否定matcher、既定値へ流れる関数で検証する前に、親recordの存在を別にassertしてnarrowする。親ごと消えても通る偽陽性を作らない。
- テスト名の最も深い動詞までassertする。「提出できる」ならmutationを実行して保存結果を確認し、「再送される」なら対象と通知証跡を確認する。
- 完全一致ですでに集合の完全性と一意性を保証した場合、同じ集合への`not.toContain`や個別件数assertionを重ねない。

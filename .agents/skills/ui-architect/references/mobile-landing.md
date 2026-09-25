# スマホで読むLP・公開ページ

LP、機能ページ、記事への入口など、登録前の人が読む公開ページをスマホ向けに設計、推敲、レビューするときに読む。
文言の一般規則は`ui-writing.md`、レイアウトの寸法は`layout.md`を正本とし、ここではスマホで読ませるための判断だけを扱う。

## 前提

2026年6月21日〜9月20日のSearch Consoleでは、シフトリの検索表示の約76%がスマホだった。
公開ページは幅360pxのスマホを基準に作り、PCでは同じ内容を広げて確認する。

スマホでは、一度に見える範囲が狭く、スクロールした先の内容を覚えておく負担が増える[^nng-mobile]。
短く平易な文章ならPCと同じように理解されるが、難しい文章では読む速度が落ちる[^nng-reading]。
簡潔にする、流し読みできる形にする、誇張をなくすという三つの書き方で、使いやすさは大きく上がる[^nng-web]。

## ファーストビュー

幅360px・高さ640〜740pxの最初の画面で、誰向けか、何ができるか、次に何をすればよいかが分かるようにする。
閲覧時間の約57%は最初の画面に、約74%は最初の2画面に集まる[^nng-fold]。

- 上から、カテゴリを示す小見出し、H1、1文のリード、主CTA、無料条件の順に置く。
- 製品画面やイラストは、主CTAより下に置く。
- H1は主張を一つにし、2行以内に収める。
- リードは1文にする。見出しと下の特徴一覧で伝わることは書かない。

## 文章の長さ

幅360pxでは、1行に入る文字数が要素ごとに決まっている。
次の目安は、シフトリのLPで実際に測った値である。

| 要素 | 1行の文字数（目安） | 書き方 |
|---|---|---|
| 本文（16px、全幅） | 約20文字 | 1文を20文字以内にする |
| カードの本文（14px） | 14〜20文字 | 1文を16文字以内にする |
| カードの見出し | 約15文字 | 15文字以内にする |
| 横並びの短いラベル（2列） | 約9文字 | 8文字前後にする |

- 本文は1文ずつ改行して表示する。機能ページでは`SentenceLines`を使う。
- 本文は2文以内にし、1文には1つのことだけを書く。
- 1文で1行に収まる説明には句点を付けない。2文以上なら各文に付ける。詳しくは`ui-writing.md`の「句点」に従う。
- 最後の1〜3文字だけが次の行に落ちる場合は、改行位置の調整ではなく文を削って直す。
- 見出しは文節ごとの配列にし、各文節を`inline-block`で並べて、文節の途中で折り返さないようにする（LPの`SectionHeading`、機能ページの`PhraseLines`）。
- `word-break: auto-phrase`は文節で折り返せるが、iPhoneのSafariは対応していない。Chromeでの補助として付けるだけにし、長さの調整を省く理由にしない。
- 見出しで伝わった内容を本文でくり返さない。
- 隣り合う要素と同じ内容を書かない。たとえば、CTAの下に無料条件を表示している場合は、CTA上の本文で同じ条件を書かない。
- 例外や細かい条件は、機能ページ、FAQ、ヘルプへ送る。スマホでは最初に要点だけを見せ、詳細は後の画面に置く[^nng-defer]。
- 並んだ項目の説明は、同じ型と同じ長さにそろえる（例：`おすすめ：時間指定`）。

## レイアウト

- 1カラムにする。PCの横並びは縦に積む。
- PCの画面キャプチャや横長の図は、スマホでは文字が読めない。スマホ画面の切り抜きか、正方形・縦長の画像に替える。
- カルーセルと自動送りは使わない。スマホでは見られないまま通り過ぎやすい[^nng-carousel]。
- 表を横スクロールさせない。カードの縦積みに替える。
- 補足はFAQなどのアコーディオンにまとめ、最初は閉じておく。

## CTA

- 主CTAは1種類にし、ファーストビュー、説明の区切り、ページ末尾に置く。
- ボタンは高さ44px以上、隣のボタンとの間を8px以上あけ、スマホでは幅いっぱいにする。
- 文言は、押すと何が起きるかが単独で分かる動詞にする（例：`無料ではじめる`）。
- 片手で持つ人が約半数いるため、主な操作は画面の中央から下に置く[^hoober]。
- 画面下部に固定するCTAは、カートや決済のような行動直前のページでは効果が出やすいが、TOPのように情報を集めるページでは効果が出なかった例が多い[^sticky]。TOPへ入れる場合は、A/Bテストで確かめてから採用する。

## 画像と表示速度

- 画像はWebPにし、1枚あたり200KB程度を目安にする。生成したPNGは変換してから公開する。
- ファーストビュー外の画像は遅延読み込みにする。
- 表示に3秒以上かかると、スマホでは半数以上が離脱する[^speed]。

## 確認の手順

1. 幅360pxと375〜390pxで、ページ全体とFAQを開いた状態を見る。320pxでは、崩れないことだけを確認する。
2. 本文が3行以上になる要素と、最後の3文字以下だけが次の行に落ちる要素を洗い出す。
3. ファーストビューに、H1、リード、主CTAが入っているかを見る。
4. 見出し、本文、隣の要素で、同じ内容をくり返していないかを見る。

手順2は、開発サーバーのページで各テキストノードの`Range.getClientRects()`から行数と最終行の幅を測ると、機械的に洗い出せる。
この測定は文言を推敲するための一時的な確認であり、残す見た目の契約はStoryのモバイル表示とVRTに任せる。

[^nng-mobile]: [Mobile Content Is Twice as Difficult（NN/g）](https://www.nngroup.com/articles/mobile-content-is-twice-as-difficult-2011/)
[^nng-reading]: [Reading Content on Mobile Devices（NN/g）](https://www.nngroup.com/articles/mobile-content/)
[^nng-web]: [Concise, SCANNABLE, and Objective（NN/g）](https://www.nngroup.com/articles/concise-scannable-and-objective-how-to-write-for-the-web/)。簡潔にすると58%、流し読みできる形にすると47%、三つを合わせると124%、使いやすさが上がった。
[^nng-fold]: [Scrolling and Attention（NN/g）](https://www.nngroup.com/articles/scrolling-and-attention/)
[^nng-defer]: [Defer Secondary Content When Writing for Mobile Users（NN/g）](https://www.nngroup.com/articles/defer-secondary-content-for-mobile/)
[^nng-carousel]: [Carousel Usability（NN/g）](https://www.nngroup.com/articles/designing-effective-carousels/)
[^hoober]: [The Thumb Zone: Designing For Mobile Users（Smashing Magazine）](https://www.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users/)。Steven Hooberの観察では、49%が片手で持っていた。
[^sticky]: [A sticky CTA: guaranteed conversion uplift?（Online Dialogue）](https://www.onlinedialogue.nl/en/blogs/sticky-cta-guaranteed-conversion-uplift/)。33件のA/Bテストのうち、TOPや一覧ページで効果が出たものはなかった。
[^speed]: [スマホ向けLP制作で注意すべき10のポイント（DirectorBank）](https://blog.directorbank.co.jp/lp-smartphone)。Googleの調査として、読み込みに3秒以上かかると53%が離脱すると紹介している。

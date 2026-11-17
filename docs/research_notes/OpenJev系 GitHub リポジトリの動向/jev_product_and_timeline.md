# TypeSafe「Jev」の製品概要と、OpenJev 系クローン出現までのタイムライン

（調査日 2026-11-17。GitHub のスター数・HN のポイント/コメント数は、特記なき限り 2026-11-17 に GitHub Search API・HN 公式 API・HN Algolia API で取得した値。時刻はすべて UTC。「二次情報のみ」と書いた項目は一次資料で確認できていない。）

## 1. Jev とは何か／誰が作ったか／ドキュメント上の用語の意味／API に何を渡し何が返るか

### Takeaway
Jev は米サンフランシスコの TypeSafe AI, Inc.（創業者・CEO は元 OpenAI の Diogo Almeida）が 2026-09-15 に早期アクセスで公開した「System One モデル」。文章は生成しない。開発者が事前に決めた答えの候補（選択肢・段階・yes/no・画像上の矩形）について、確率と、一部の型では confidence を返す API（`POST /v1/systemone`）である。「semantic if」と「prefill-only」は TypeSafe の公式用語ではなく、クローン側の言葉。TypeSafe 自身は「smart if-statements」「parallel sampler」と表現している。

### Cited Findings

#### 会社・人物・名前の由来
- 2026-09-15 の発表記事。著者表記は「Diogo Almeida, founder, TypeSafe」。本文には「At OpenAI, I helped build the methods that made language models useful at following instructions and talking with people. That work ended up as the research behind ChatGPT.」「After two years in stealth ... TypeSafe AI is releasing our first System One Model」とある — [Introducing System One Models & Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- 2026-09-21 公開の Latent Space 対談では、Diogo Almeida の肩書は「CEO, TypeSafe AI」 — [Latent Space: Jev: System One Models for Prod, Not God](https://www.latent.space/p/jev)、[HN 49794590](https://news.ycombinator.com/item?id=49794590)
- サイトのフッター表記は「Made in SF. With Love.」 — [typesafe.ai](https://typesafe.ai/)
- 名前の由来: 「System One」は Kahneman『Thinking, Fast and Slow』の System 1 から。「Jev」は William Stanley Jevons（ジェボンズのパラドックス）から。後者について発表記事は「Every order of magnitude drop in the cost of intelligence unlocks orders of magnitude more use cases」と書いている — [発表記事 FAQ](https://typesafe.ai/blog/introducing-system-one-models-and-jev)、[docs: System One](https://docs.typesafe.ai/concepts/system-one)
- 質問型 Noul の名前は Bernoulli から来ている、という発言が対談にある（WebFetch の要約経由で、逐語は未確認） — [Latent Space](https://www.latent.space/p/jev)
- 2026-10-09: Andreessen Horowitz 主導（Sequoia Capital と既存投資家 DCVC が参加）で「$870 million at a $7.5B valuation」を調達し、Martin Casado が取締役に就いた。同記事は「A third of the Fortune 500 are getting their Jev on」と自称している — [TypeSafe A raises Series AI](https://typesafe.ai/blog/series-ai)

#### 公式ドキュメントでの用語の意味
- **System One model**:「System One models are a class of AI models built to make fast, structured decisions that software can use directly. A System One model evaluates a state and returns typed answers and probabilities.」「System One models do not write replies, produce code, or generate explanations of their reasoning.」 — [docs: System One](https://docs.typesafe.ai/concepts/system-one)
- **typed decisions**: ホームの見出しは「Decisions, not strings / Typed outputs that software can act on.」。発表記事は、答えの型と構造が事前に定義されるので「The model never makes type errors」と主張している — [typesafe.ai](https://typesafe.ai/)、[発表記事](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- **calibrated probabilities**: 定義は「trained for calibrated decisions: their probabilities are optimized against outcomes to reflect uncertainty. Calibration is measured across groups of predictions; it does not guarantee that an individual answer is correct.」。学習手法は RLCD（Reinforcement Learning for Calibrated Decisions）と呼ばれる — [docs: System One](https://docs.typesafe.ai/concepts/system-one)、[typesafe.ai](https://typesafe.ai/)
- **生成方式**: 発表記事は LLM の「Sequential. Generates one token at a time」に対して、Jev は「Parallel. Generates all outputs in a single query. Incredibly efficient and hardware-aware.」と説明し、「new model architecture, parallel sampler ... and training method ... RLCD」を挙げる — [発表記事](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- **if 文としての位置づけ（TypeSafe の言い方）**: 発表記事は「AI-Powered Workflows / smart if-statements. Structured outputs slot into ordinary software as fuzzy decision rules: classify, route, score, extract, or branch」と書く。Jev 1.14 の記事も「smart-if statements」という語を使う — [発表記事](https://typesafe.ai/blog/introducing-system-one-models-and-jev)、[Jev 1.14](https://typesafe.ai/blog/jev-1-14)
- **呼び名へのこだわり**: 2026-11-03 の DevRel 記事（Allie Laabs）は、「decision model」という呼び名が広まったことを認めたうえで「System One model」と呼び続ける理由を説明している。副題は「Jev makes judgments, code makes decisions.」 — [Don’t Call It a Decision Model](https://typesafe.ai/blog/dont-call-it-a-decision-model)
- **「semantic if」「prefill」は公式用語ではない**: TypeSafe の全文ドキュメント（llms-full.txt、約1.4MB）を検索したが、どちらの語も出てこなかった（2026-11-17 確認） — [docs.typesafe.ai/llms-full.txt](https://docs.typesafe.ai/llms-full.txt)
  - 「Semantic ifs from open models」はクローン SemIf（旧 OpenJev）の標語 — [SemIf README](https://raw.githubusercontent.com/TheoLeeCJ/SemIf-OpenJev/HEAD/README.md)
  - 「prefill-only」は ekzhang/openjev-sglang のリポジトリ説明文にある言葉。同 README は「This is a prefill plus first-token-readout workload: there is no generated chain」と説明する — [openjev-sglang README](https://raw.githubusercontent.com/ekzhang/openjev-sglang/HEAD/README.md)

#### API：何を渡し、何が返るか
- エンドポイントは `POST https://api.typesafe.ai/v1/systemone`、認証は Bearer。OpenAPI は title「TypeSafe」、version 0.2.0。必須フィールドは `model`、`state`、`questions` の3つ（`questions` は1件以上で、キー名は利用者が自由に付ける）。任意で `assets`（画像）を付けられる — [API reference: System One](https://docs.typesafe.ai/api/system-one)
- `state` は文字列・JSON オブジェクト・配列のいずれでもよい。説明は「The content all questions in this request refer to.」 — [API reference](https://docs.typesafe.ai/api/system-one)
- 質問の型（TypeSafe は「AI primitives」と呼ぶ）は4つ — [docs: Introduction](https://docs.typesafe.ai/introduction)、[API reference](https://docs.typesafe.ai/api/system-one)

  | 型 | 用途 | 返り値 |
  |---|---|---|
  | **Choice** | 選択肢の中から1つ選ぶ | `choice`、`probabilities`、`confidence` |
  | **Score** | 順序付きの段階で採点する | `score`、`probabilities`、`confidence`、`legend` |
  | **Noul** | yes/no の文が真である確率（0〜1） | `noul` のみ |
  | **Box** | 画像上の位置（Jev 1.14 から） | `box`（top/bottom/left/right）、`confidence` |

- 各質問には `type`、`instructions`、`criteria` を指定する。`criteria` は、Choice なら選択肢名→説明の辞書、Score なら段階のリスト — [API reference](https://docs.typesafe.ai/api/system-one)
- Choice の選択肢は最大 255 個まで — [docs: Choice](https://docs.typesafe.ai/primitives/choice)。発表記事は「Jev supports a cardinality up to 255」と書き、選択肢が多いときは2段階で処理すると説明している — [発表記事](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- 公式例（state は「I was charged twice for my subscription this month. Please refund the extra charge.」） — [API reference](https://docs.typesafe.ai/api/system-one)
  - Choice「tone」（angry/calm/excited）の答え: `{"choice":"calm","confidence":0.7,"probabilities":{"angry":0.15,"calm":0.8,"excited":0.05}}`
  - Score「urgency」の答え: `score: 1.7`、`confidence: 0.55`
  - Noul「billing」の答え: `noul: 0.98`
  - レスポンス全体は `model`（実際に答えた版の ID）、`answers`、`usage{input_tokens, output_tokens}` の3つ
- 全質問は同じ state に対して「in parallel and in isolation」で評価されるので、質問を増やしても応答時間はほとんど変わらない、とドキュメントは主張している — [docs: Introduction](https://docs.typesafe.ai/introduction)
- 画像は `TypeSafe-Danger-Zone-Images: true` ヘッダ、長文脈は `TypeSafe-Danger-Zone-Long-Context: true` ヘッダで有効になる。multipart/form-data でも送れる — [API reference](https://docs.typesafe.ai/api/system-one)、[docs: Models](https://docs.typesafe.ai/models)
- 公式 SDK とツール — [Quick start](https://docs.typesafe.ai/introduction/quickstart)
  - Python: `typesafe-sdk`（Python 3.10 以上）
  - JavaScript: `@typesafe-ai/sdk`（Node.js 20 以上）
  - Claude Code などのエージェント向けスキル: `claude plugin install typesafe@typesafe-ai` または `npx skills add typesafe-ai/skills`
- 速度とコストはベンダーの自己申告で、次の数字が出ている。発表記事自身が「we expect that these are on the higher end of real world gains」と注記している — [typesafe.ai](https://typesafe.ai/)、[発表記事](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
  - 応答時間: 70〜500ms
  - 「193.6x Faster, 444.6x Cheaper」（自社の workflow evals に基づく）
  - デモ比較: TypeSafe は「Cost $0.000081 / Completed in 0.114s」、LLM は「Cost $0.013880 / Completed in 8.566s」
- 比較の基準には GPT-6 Astra と Fable 5.1 の平均を使っており、OpenAI と Anthropic 寄りのバイアスがあることを TypeSafe 自身が認めている — [発表記事](https://typesafe.ai/blog/introducing-system-one-models-and-jev)

### Inferences
- 日本語の読者向けに言い換えると、Jev は「LLM に JSON を書かせて、それを読んで分岐する」作り方の代わりになるもの。答えの候補を先に渡し、モデルには各候補の確率だけを返させる。プログラムの if 文の条件判定を AI にやらせる部品、と考えると近い。
- クローン側が言う「prefill-only」は、文章を生成（decode）せず、入力の読み込み（prefill）1回で候補ごとの確率を読み取る実装方式を指す。TypeSafe は内部方式を公開していないので、Jev 本体が prefill-only なのかは分からない。

### Gaps
- Jev のアーキテクチャとパラメータ数は公開されていない（第2問を参照）。
- トップページと発表記事の FAQ（「Is Jev just a smaller LLM?」「Where does it struggle?」など）は、回答本文が静的 HTML に含まれておらず読めなかった。

## 2. バージョンと日付、提供状況（waitlist）、料金、レート制限、対応言語（日本語）、モデルサイズ、利用規約

### Takeaway
経緯は次のとおり。
- 2026-09-15: jev-1.13.0 で早期アクセスを開始（waitlist 制）
- 2026-09-20: waitlist を撤廃
- 2026-09-22: 需要過多で新規登録を一時停止
- 2026-10-14: Jev 1.14 を公開（画像入力、Box 型、長文脈、多言語の改善）

料金は入力 $0.042／100万トークン（$42／10億トークン）で、出力は無料。レート制限は組織ごとに決まり、具体的な値は公開されていない。日本語対応を明記した公式資料は見つからず、1.14 の変更点に「Better multilingual support」とあるだけ。モデルサイズも非公開。顧客契約（MCA、2026-09-23 更新）は、蒸留、出力を模倣するモデルの学習、類似・競合製品の開発、リバースエンジニアリングを禁じている。

### Cited Findings

#### バージョンと日付
- 2026-09-15:「Our first public model is Jev, available today in early access.」「Today, we are opening early access and bringing developers off the waitlist as quickly as we can.」 — [発表記事](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- 公開時のモデルは jev-1.13.0。根拠は 1.14 の記事の一文「Surprise: the Jev you all know and love (jev-1.13.0) was multimodal all along!」 — [Jev 1.14](https://typesafe.ai/blog/jev-1-14)
- 2026-10-14 の Jev 1.14 リリースについて — [Jev 1.14](https://typesafe.ai/blog/jev-1-14)
  - jev-1.14.0 はまず `jev-preview` として公開。「jev-latest will be updated to jev-1.14.0 in a week」
  - 廃止前の予告期間は、1.13 が60日、1.14 が30日の予定
  - 利用者が任意で問い合わせを提供できる opt-in を新設。ただし「We will still not train on your queries」
- 公式の変更履歴（Model changelog）にある Jev 1.14（October 14, 2026）の項目 — [docs: Changelog](https://docs.typesafe.ai/changelog)
  - 「Better multilingual support」
  - Box 型の追加
  - 画像を `state`／`instructions`／`criteria` に入れられる（1.13 でも可）
  - long context で 262k トークン（1.13 でも可）
- 2026-11-17 時点のエイリアスは、`jev-latest` と `jev-preview` がどちらも jev-1.14.0 を指す（preview ビルドは現在なし） — [docs: Models](https://docs.typesafe.ai/models)
- コンテキスト長は「64k per-request / 32k per-question」。前者は state と全質問の合計、後者は state と1つの質問の合計。長文脈ヘッダを付けると両方とも 262k になる。料金は同じだが「slower and less accurate」と注意書きがある — [docs: Models](https://docs.typesafe.ai/models)
- 入力として読めるのはテキスト（文字列、JSON、配列）と PNG／JPEG 画像。「It does not natively accept audio or video (yet)」 — [docs: Models](https://docs.typesafe.ai/models)
- 顧客ごとのカスタマイズはしない。「Jev is not fine-tuned or LoRA-adapted with customer data ... the same weights serve every account.」 — [docs: Models](https://docs.typesafe.ai/models)

#### 提供状況（誰が使えるか）
- 2026-09-15 の時点では waitlist 制だった。ホームに「Join Waitlist」ボタンがあり、メールで順番に招待していた — [flaviocopes.com（2026-09-24 公開、2026-10-09 更新、当時のスクリーンショット付き）](https://flaviocopes.com/jev-api-key/)（二次情報）
- 2026-09-20 に TypeSafe は X で「誰でも使える、waitlist なし」と告知し、2日もたたないうちに需要過多で新規登録を一時停止した。以下はいずれも flaviocopes.com が引用している X 投稿（投稿本文は直接取得していない） — [flaviocopes.com](https://flaviocopes.com/jev-api-key/)
  - [告知の投稿 2101786156572823624](https://x.com/typesafeai/status/2101786156572823624): 投稿 ID（Snowflake 形式）から計算した投稿時刻は 2026-09-20T21:30:43Z
  - [一時停止の投稿 2102281508950307159](https://x.com/typesafeai/status/2102281508950307159): 同じく 2026-09-22T06:19:04Z
  - 時刻は筆者の計算。後者は drawpie.com の「paused new signups at 06:19 UTC on Tuesday 22 September 2026」と一致する — [drawpie（検索結果の要約のみ）](https://drawpie.com/blog/what-is-jev-typesafe-ai-model/)
- 2026-09-24 の時点で、ホームに waitlist ボタンはなく、ヘッダには「Sign in」「Contact sales」が出ていた — [flaviocopes.com](https://flaviocopes.com/jev-api-key/)
- 2026-11-17 の時点でも、サイトの meta description は「Try our first System One Model, Jev, in early access.」のまま — [typesafe.ai](https://typesafe.ai/)
- 始め方は Quick start の「Get an API key from the TypeSafe console」 — [Quick start](https://docs.typesafe.ai/introduction/quickstart)
- 契約の形: Master Customer Agreement（MCA）の契約相手は、Order またはチェックアウトで特定された「Customer」。利用は前払いのクレジット制で、Purchased Credits と Promotional Credits があり、自動チャージも選べる — [MCA](https://typesafe.ai/legal/mca)
- 無料クレジットについては情報が食い違う。
  - 「新規アカウントに $5 の無料クレジット（約1.2億トークン相当）」という報道がある（二次情報、検索結果の要約のみ） — [cryptobriefing](https://cryptobriefing.com/typesafe-jev-ai-public-access/)
  - 一方 flaviocopes は「The TypeSafe docs don't cover ... free credits, as of September 2026」と書いている — [flaviocopes.com](https://flaviocopes.com/jev-api-key/)
- OpenRouter での掲載状況 — [OpenRouter: ~typesafe/jev-latest](https://openrouter.ai/~typesafe/jev-latest)、[OpenRouter models API](https://openrouter.ai/api/v1/models)
  - 「TypeSafe: Jev Latest」（Jev 1.14 にリダイレクト）、Jev 1.13、Jev 1.14 のページがある。説明は「accepts text and images as input and returns structured decisions」
  - API 一覧には `typesafe/jev-router`（「TypeSafe: Jev Router」）も載っている。created 値から計算すると 2026-09-25T19:12:40Z の登録で、リクエストごとにモデルと推論の強さを選ぶルーター
- サービスの拠点は米国西海岸（「this is where our service is currently based」） — [発表記事](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- エンタープライズ顧客向けにゼロデータ保持（ZDR）がある — [docs: Legal](https://docs.typesafe.ai/legal)

#### 料金
- Jev 1.14 と 1.13 はどちらも「$42 / $0.042」（per Btok / per Mtok）。課金は入力トークンだけで、「Output tokens are free」 — [docs: Models](https://docs.typesafe.ai/models)
- ホームには「$42 Per Billion input tokens」「238x Lower input price than Claude Fable 5.1」とある — [typesafe.ai](https://typesafe.ai/)
- 価格が補助金で支えられていないか、について発表記事はこう書く:「We can’t prove it isn’t subsidized; we’ll need the long-term to prove the sustainability of our pricing (which we expect to go down, not up).」 — [発表記事](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- 利用額の目安: Doom デモは毎秒10回の問い合わせで、費用は約 $7／時間 — [発表記事](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- 導入事例: Jack & Jill は候補者スクリーニングのコストを 88% 下げた（2026-10-07 公開） — [case study](https://typesafe.ai/blog/jack-jill-jev-case-study)

#### レート制限
- 制限は組織ごとに決まり、tokens per second と requests per second で測る。超えると 429 が返り、公式 SDK は retry-after に従って自動で再試行する。具体的な値は開発者コンソールでしか見られない。引き上げは申請フォームから行い、custom／enterprise プランなら上限が高くなる — [docs: Models](https://docs.typesafe.ai/models)

#### 対応言語（日本語）
- 公式ドキュメントに対応言語の一覧は見当たらない。1.14 の変更点に「Better multilingual support」、1.14 の記事に「we expect the largest gain in multi-lingual support」とあるだけ — [Changelog](https://docs.typesafe.ai/changelog)、[Jev 1.14](https://typesafe.ai/blog/jev-1-14)
- 日本の技術メディア（一創）は「公式のモデルページは学習の主言語を英語としており、日本語を含むCJKについては扱えるものの同等の精度ではないと明記」と書いている。ただし該当ページは 403 で開けず、検索結果の要約しか読めていない。TypeSafe の docs 全文にも、それに当たる記述は見つからなかった — [issoh.co.jp](https://www.issoh.co.jp/md/tech/18238)
- Latent Space の対談では、言語の話題は出ていない（WebFetch の要約による） — [Latent Space](https://www.latent.space/p/jev)
- 日本の開発者による利用例（作成日は GitHub Search API、2026-11-17 取得）
  - [heiwa4126/jev-bun1](https://github.com/heiwa4126/jev-bun1)（2026-09-17 作成）: 説明は「TypeSafe の Jev を TypeScript SDK で使ってみる最初の 1 歩」
  - [genai-craft/openvons](https://github.com/genai-craft/openvons)（2026-09-17 作成、15★）: 説明は「openvons (open-Jev): 有限選択肢に確率で答える判断層 — テキスト / 画像 / 日本語音声コマンド」

#### モデルサイズ
- 公開されていない。Latent Space の対談で、Diogo は内部構造について「I probably shouldn't talk too much about the insides of ML」と述べ、将来サイズ違いのモデルを出すかと聞かれて「Absolutely」と答えている（WebFetch の要約経由の引用で、逐語は未確認） — [Latent Space](https://www.latent.space/p/jev)

#### 利用規約（リバースエンジニアリングと、互換・競合クローン）
- **MCA**（Last updated Sep 23, 2026）§2.3 License Restrictions の主な条項 — [MCA](https://typesafe.ai/legal/mca)
  - (b)「use the Services or any Output ... to perform model distillation, train a model to imitate the output of the Services, or develop (or to facilitate the development of) a similar or competing product or service」
  - (c)「reverse engineer, decompile, disassemble, or attempt to access or derive the source code or underlying data with respect to the Services, including the underlying ideas, algorithms, structure, or organization ...」
  - (d)「modify or create derivative works of the Services」
- **AUP**（Last updated Sep 23, 2026） — [AUP](https://typesafe.ai/legal/acceptable-use-policy)
  - §3.1「reverse engineer, decompile, disassemble, or access or derive the source code or data used to develop the Services」
  - §3.2 スクレイピングとクローリングの禁止
  - §1.4「mislead others about whether content, including Output, was generated by AI」の禁止
- **サイト利用規約**（Terms of Use、Last updated Sep 19, 2026）: 対象は Web サイトだけで、サイトのリバースエンジニアリングとスクレイピングを禁じている。製品は別契約（MCA）が優先する — [Terms](https://typesafe.ai/legal/terms)
- MCA、AUP、Terms の本文には、「Jev-compatible」という言葉も、互換 API の実装そのものについての条項も見当たらない（2026-11-17 確認） — [MCA](https://typesafe.ai/legal/mca)、[AUP](https://typesafe.ai/legal/acceptable-use-policy)、[Terms](https://typesafe.ai/legal/terms)
- MCA のその他の条項 — [MCA](https://typesafe.ai/legal/mca)
  - §4.2: Output の権利は顧客に譲渡される
  - §4.1: 顧客データは「to train (i.e., to modify the model weights of)」には顧客の同意なしに使わない
  - API の更新で互換性が崩れうることも定めている

### Inferences
- MCA (b) は「TypeSafe のサービスや Output を使って」模倣モデルや競合製品を作ることを禁じる契約条項で、契約の当事者（顧客）を縛るもの。API を使わずにオープンモデルで同じインターフェースを作り直すこと自体を直接禁じる文言ではない、と読める。
  - SemIf の README は「The Jev number is read from TypeSafe's published records; we did not run a live Jev endpoint.」と書いている。live の Jev を使わなかったと明記しているのは、この線引きを意識したためかもしれない（推測）。
- 規約3文書の更新日（Terms が 9/19、MCA と AUP が 9/23）は、クローンが相次いだ時期（9/16〜）の直後にあたる。ただし以前の版を確認できていないので、何が変わったのか、クローンへの対応なのかは分からない。

### Gaps
- 規約の 9/19・9/23 の更新内容: Wayback Machine の CDX API がこの環境から接続リセットになり、旧版と比べられなかった。
- 9/22 の新規登録停止がいつ解除されたか、現在誰でも登録できるのか: 一次情報が見つからない。
- 無料クレジットの有無と金額: 情報源同士が食い違い、一次情報もない。
- 公式の対応言語一覧と日本語での精度: 一次情報がない。
- レート制限の具体的な数値: 公開されていない。

## 3. 公開の「Jev 互換」API 仕様・テストスイートはあるか。誰が定めたか

### Takeaway
TypeSafe 自身が出している「互換」の拠り所は3つしかない。
- 公開 OpenAPI（`/v1/systemone`、v0.2.0）
- 公式 SDK
- LLM を System One API の形に包む公式アダプタ typesafe-ai/system-one-adapter-python

「JevCompat（32/32 MUST）」はコミュニティが作った仕様と適合テストで、mandu5/jevcompat（2026-09-24 作成）が出所。「AnyJev L0 Prefill」は、MicroLLM の README が Nokia Applied Research の論文に由来するとしている、選択肢の並び順による偏りを打ち消す手法の名前。どちらも TypeSafe の公式なものではない。

### Cited Findings
- 公式 OpenAPI は `https://api.typesafe.ai/openapi.json`（title「TypeSafe」、version 0.2.0） — [API reference](https://docs.typesafe.ai/api/system-one)
- 公式アダプタ [typesafe-ai/system-one-adapter-python](https://github.com/typesafe-ai/system-one-adapter-python) は、説明が「Drop-in TypeSafeClient replacement backed by LLM APIs」。2026-08-08 作成、MIT、410★（GitHub Search API） — 発表記事は LLM との比較にこれを使ったと書いている:「The LLMs use our System One LLM wrapper, which constrains LLMs to output structured decisions compatible with our API.」 — [発表記事](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- **jevcompat**（[mandu5/jevcompat](https://github.com/mandu5/jevcompat)、2026-09-24 作成、MIT、5★） — [jevcompat README](https://raw.githubusercontent.com/mandu5/jevcompat/HEAD/README.md)
  - 冒頭の一文:「About a hundred servers say they are "Jev-compatible". Nothing said what that means. Now something does.」
  - SPEC.md は「48 requirements, each with a level (MUST / SHOULD) and the official source it comes from」。TypeSafe の docs、OpenAPI、SDK が食い違っている箇所が8つあり、その場合どれを優先するかも決めている
  - 提供物は3つ: 仕様書、`jevcompat test URL`（任意のサーバを検査する）、`jevcompat proxy URL`（仕様どおりに直す前段プロキシ）
- jevcompat が 2026-09-24 に M1 Pro で計測した、スター数上位8サーバの結果（★はその日の値） — [jevcompat README](https://raw.githubusercontent.com/mandu5/jevcompat/HEAD/README.md)

  | サーバ | ★（9/24） | MUST | 判定 | 主な不適合 |
  |---|---:|---:|---|---|
  | jaredpalmer/kev（0.8B） | 5.8k | 32/32 | conformant | なし |
  | Mapika/decider（0.8B） | 338 | 32/32 | conformant | なし |
  | wfzyx/von | 571 | 31/32 | 不適合 | object／array の `instructions` を拒否 |
  | Rizzo-AI-Academy/rizzo-flow | 389 | 31/32 | 不適合 | 26 を超える選択肢を拒否 |
  | Zefan-Cai/Open-Jev | 284 | 31/32 | 不適合 | 片側だけの noul criteria を拒否 |
  | NandhaKishorM/laya | 20.1k | 30/32 | 不適合 | 128 選択肢を拒否、`null` の legend |
  | logan-markewich/jeff | 230 | 30/32 | 不適合 | 64 を超える選択肢を拒否、score の計算 |
  | featherless-ai/simple-jev | 499 | 29/32 | 不適合 | `"model": "jev-latest"` を拒否 など |

- 同じ README の指摘「`confidence` is not portable」: 同じ 204 件の回答に閾値 0.9 を当てると、自動承認される割合は TypeSafe の式で 58%、Laya の定義（1 − 正規化エントロピー）で 30% と大きく違う — [jevcompat README](https://raw.githubusercontent.com/mandu5/jevcompat/HEAD/README.md)
- **MicroLLM**（[jmrenouard/MicroLLM](https://github.com/jmrenouard/MicroLLM)、2026-10-21 作成、8★） — [MicroLLM README](https://raw.githubusercontent.com/jmrenouard/MicroLLM/HEAD/README.md)
  - バッジは「JevCompat 0.1 — 32/32 MUST」
  - 「AnyJev L₀」は、選択肢を循環的に並べ替え、対数確率を平均して並び順の影響を消す手法（Van der Corput スケジュール付き）。実装ファイルは `prefill_llm.py`
  - 典拠として挙げている論文（いずれも README の記載のみで未確認）:「AnyJev Technical Report — Nokia Applied Research (arXiv:2610.00831)」「OpenJev-RLCD — Gao & Wang (arXiv:2609.38850)」「StartLux-Decision — StartLux & HKU (arXiv:2610.17309)」
- TypeSafe の通信形式（`POST /v1/systemone`）を実装し、公式 SDK がそのまま使えると主張するクローンが多い。
  - razorback16/openjev:「OpenJev uses the same wire API as TypeSafe's Jev, so their SDKs work with it unchanged」 — [razorback16 README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)
  - ekzhang/openjev-sglang:「A server implementing the TypeSafe/Jev HTTP API」 — [openjev-sglang README](https://raw.githubusercontent.com/ekzhang/openjev-sglang/HEAD/README.md)
  - Mapika/decider:「It speaks TypeSafe’s wire format: `POST /v1/systemone`」 — [SiliconLabAI/OpenJev README](https://raw.githubusercontent.com/SiliconLabAI/OpenJev/HEAD/README.md)
- SemIf のリポジトリでは、外部の人が互換サーバを提案している — [GitHub Search API: issues](https://github.com/TheoLeeCJ/SemIf-OpenJev/issues)
  - PR #27「Add semif-serve: a Jev-compatible HTTP layer」（2026-09-22）
  - issue #38「Plan for TypeSafe AI compatible API server?」（2026-09-24）
- ekzhang は README の冒頭で「SGLang is now shipping with a native decisions endpoint implemented in the same way」と案内している — [openjev-sglang README](https://raw.githubusercontent.com/ekzhang/openjev-sglang/HEAD/README.md)（SGLang の docs 本体 https://docs.sglang.io/docs/supported-models/decision_models は未確認）
- OpenAI 互換をうたうクローンもある。razorback16 は「It also answers OpenAI's Decisions API, so the OpenAI SDKs' `client.decisions.create` works too」と書く — [razorback16 README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)

### Inferences
- 「Jev 互換」とは実際には「TypeSafe が公開した OpenAPI と公式 SDK でそのまま読めること」を意味する。それを検証する基準は、コミュニティ（jevcompat）が後から決めた。
- confidence の計算式は実装ごとに違う。そのため互換サーバに差し替えると、同じ閾値でも自動処理される件数が変わってしまう。jevcompat が最も重要だとしている点で、日本の読者にとっても実用上の注意点になる。

### Gaps
- jevcompat や互換実装について TypeSafe が公式にコメントしたか: 見つからなかった。
- arXiv:2610.00831、2609.38850、2610.17309 が実在するか、内容はどうか: 確認していない。
- jevcompat の SPEC.md 本体（48要件の全文）は読んでいない。

## 4. タイムライン（Jev の発表から 2026-11-17 まで）：クローンの波、改名、話題になった投稿、TypeSafe の反応

### Takeaway
全体の流れは次のとおり。
- **2026-09-15**: Jev 発表。HN で 1989 ポイント
- **2026-09-16 03:51**（HN 投稿 09-15 19:25 の約8.5時間後）: 最初の「openjev」リポジトリ（TheoLeeCJ）が作成される
- **9/16〜9/18**: jevlike、decider、AlexWortega/openjev（Hugging Face）、kev、Laya、razorback16/openjev などが立て続けに登場
- **9/18 09:42**: HN に「OpenJev」（openjev.com）が投稿され、現在 722 ポイント／296 コメント。同スレッドで「Jev は商標では？」というコメントが出た約3.5時間後に、TheoLeeCJ のプロジェクトは「SemIf」に改名
- **TypeSafe 側**: クローンについての公式声明は出していない。waitlist 撤廃（9/20）、登録の一時停止（9/22）、大型調達（10/9）、Jev 1.14（10/14）、「decision model と呼ばないで」記事（11/3）と、自社の路線で動いた
- **他社**: 同じ時期に OpenAI（Decisions API、9/29 DevDay、二次情報）、Amazon（Strands Decider）、Cloudflare（Clef）などが参入

### Cited Findings

#### 2026-09-15〜09-17：発表と最初のクローン
- **2026-09-15**: 発表記事「Introducing System One Models & Jev」 — [TypeSafe blog](https://typesafe.ai/blog/introducing-system-one-models-and-jev)。HN への投稿は 19:25、1989 points／520 comments — [HN 49717558](https://news.ycombinator.com/item?id=49717558)
- **2026-09-16 03:51:21**: [TheoLeeCJ/SemIf-OpenJev](https://github.com/TheoLeeCJ/SemIf-OpenJev) が作成された。「openjev」を名前に含むリポジトリでは最も早い（GitHub Search API）
  - 当初の名前は TheoLeeCJ/openjev。2026-09-18 公開の apidog 記事は、この URL を「Can we run something like Jev on a 3090 at home?」に答える「MIT-licensed Python package」として紹介している — [apidog](https://apidog.com/blog/openjev-open-source-jev-alternatives/)
- **2026-09-16** に作成されたもの（作成時刻は GitHub Search API）
  - [vinnylarouge/jevlike](https://github.com/vinnylarouge/jevlike)
  - [Mapika/decider](https://github.com/Mapika/decider)
  - [zhihz/openjev](https://github.com/zhihz/openjev)（16:39）: 中英2言語対応。バックエンドは固定した Qwen3-4B-Instruct-2507 で、「It does not contain Jev's proprietary code, weights, or RLCD implementation.」と明記 — [zhihz README](https://raw.githubusercontent.com/zhihz/openjev/HEAD/README.md)
  - [shamazharikh/qwen-rlcd](https://github.com/shamazharikh/qwen-rlcd)（20:43）
  - [kw2828/OpenJev](https://github.com/kw2828/OpenJev)（22:15）
- **2026-09-16 18:25:10**: Hugging Face に [AlexWortega/openjev](https://huggingface.co/AlexWortega/openjev) が登録された。Qwen3.5-4B を3クラスの NLI cross-encoder に微調整したもので、MIT、654 likes — [HF API](https://huggingface.co/api/models/AlexWortega/openjev)
  - 2026-09-17 作成の mikesmullin/openjev は、説明が「Local reproduction of AlexWortega/openjev (Qwen3.5-4B NLI cross-encoder playing Doom)」 — [mikesmullin README](https://raw.githubusercontent.com/mikesmullin/openjev/HEAD/README.md)
  - GitHub 上の AlexWortega/openjev は README が 404（実体は Hugging Face 上のモデル）
- **2026-09-16 18:49**: HN「Reverse-engineered Jev-like model」（jevlike）、169 points — [HN 49731282](https://news.ycombinator.com/item?id=49731282)。apidog は、jevlike の README 自体は「TypeSafe has not published its design. This repository is an independent starter model with the same input and output shape.」と書いており、「リバースエンジニアリング」という見出しと食い違うと指摘している — [apidog](https://apidog.com/blog/openjev-open-source-jev-alternatives/)
- **2026-09-16〜17**: クローンとは別に、Jev を組み込んだり紹介したりするリポジトリも大量にできた（すべて GitHub Search API、2026-11-17 取得）
  - 名前に jev を含む [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast)（説明は「Fastest and cheapest web agent」）: 2026-09-16 作成、24,562★
  - [jkudish/jev-mcp](https://github.com/jkudish/jev-mcp): 583★
  - [AbdelStark/awesome-typesafe-jev](https://github.com/AbdelStark/awesome-typesafe-jev): 618★
  - [yibie/awesome-jev](https://github.com/yibie/awesome-jev): 2,603★
  - 「jev」で検索にかかり 9/15〜9/17 に作成されたリポジトリは 625 件（統合ツールや無関係なものも含む）
- **2026-09-17** に登場したもの
  - [daseinlabs/open-jev](https://github.com/daseinlabs/open-jev): HN 投稿は 06:49 — [HN 49737236](https://news.ycombinator.com/item?id=49737236)
  - [ekzhang/openjev-sglang](https://github.com/ekzhang/openjev-sglang)（18:11 作成）: Qwen3.6-35B-A3B を SGLang 上で動かし、GPU は B200 — [README](https://raw.githubusercontent.com/ekzhang/openjev-sglang/HEAD/README.md)
  - [jaredpalmer/kev](https://github.com/jaredpalmer/kev) の作成（GitHub Search API）
- **2026-09-17 05:13**: HN「Open-sourced jev architecture last year with model,paper and dataset」（nandakishor_ml、97 points）。後の Laya の作者 — [HN 49736660](https://news.ycombinator.com/item?id=49736660)

#### 2026-09-18〜09-19：話題の拡大と改名
- **2026-09-18 09:42:22**: HN に「OpenJev」が投稿された（URL は https://openjev.com/、投稿者 ilreb）。2026-11-17 時点で 722 points／296 comments — [HN 49752041](https://news.ycombinator.com/item?id=49752041)
  - 他の媒体が書いた数字は取得時点が違う: EnterpriseDNA（2026-09-18）は 450 points／226 comments — [EnterpriseDNA AI Pulse](https://enterprisedna.co/resources/ai-pulse/ai-pulse-2026-09-18-jev-branded-tooling-cluster-swarms-hn-and-github)。ai-tldr.dev は改名を 2026-09-18、621 points の時点と記載（検索結果の要約のみ） — [ai-tldr.dev](https://ai-tldr.dev/releases/theoleecj-semif/)
- 同じスレッドで商標を問うコメントが出た。
  - 10:46「Isn't Jev a trademark?」 — [HN 49752509](https://news.ycombinator.com/item?id=49752509)
  - 12:35「Using a trademark in your brand name is not. You can't create "OpenExcel" or "OpenOpenAi"」 — [HN 49753517](https://news.ycombinator.com/item?id=49753517)
- **2026-09-18 14:20:51**（現地表記 22:20:51+08:00）: SemIf のリポジトリに「Release SemIf」というコミットが入った — [GitHub Search API: commits](https://github.com/TheoLeeCJ/SemIf-OpenJev/commits)
- 改名後の README の主な記述 — [SemIf README](https://raw.githubusercontent.com/TheoLeeCJ/SemIf-OpenJev/HEAD/README.md)
  - 見出し「SemIf (formerly OpenJev)」
  - 「It is not affiliated with or endorsed by TypeSafe. Jev, TypeSafe, and other names and marks are the property of their respective owners. No infringement is intended.」
  - 「Wow! No waitlist.」
  - 品質: TypeSafe の公開評価から作った 102 行のサブセットで、Qwen3.5-4B が 0.845、公開されている Jev の値が 0.883
  - 速度: RTX 3090 で、21 個の判定を確率で直接読むと 1.023 秒、JSON 配列を生成させると 5.332 秒
- openjev.com も同じ内容になっている:「OpenJev / SemIf - Semantic If On-Device」「Formerly called OpenJev. Not affiliated with or endorsed by TypeSafe. No infringement is intended.」「There is no waitlist!」（2026-11-17 確認） — [openjev.com](https://openjev.com/)
- **2026-09-18**: [razorback16/openjev](https://github.com/razorback16/openjev) が作成された（09:15、DiffusionGemma 26B-A4B を使用、Apache-2.0）。r/LocalLLaMA には「Still on the Jev waitlist? I hosted OpenJev. It's free, go play with it」（u/Every-Comment5473）が投稿された。codiv.ai で 100M トークンを無料で使え、投稿者は「Just a fan of TypeSafe's idea, not affiliated」と書いている — [prismix.dev のミラー（日付 2026-09-18）](https://prismix.dev/news/2898fdd07155)、[razorback16 README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)
- **2026-09-18** に作成された他のリポジトリ（GitHub Search API）
  - [NandhaKishorM/laya](https://github.com/NandhaKishorM/laya)
  - [bespokelabsai/nimble](https://github.com/bespokelabsai/nimble)
  - [wfzyx/von](https://github.com/wfzyx/von)
  - [featherless-ai/simple-jev](https://github.com/featherless-ai/simple-jev)
  - Bespoke Nimble を紹介する madiator の X 投稿は、ID から計算すると 16:49 — [HN 49757009](https://news.ycombinator.com/item?id=49757009)
- **2026-09-18**: Luke Berry の X のジョーク投稿「i'm hiring a senior jev engineer, at least 2 years of experience with jev is a requirement, dm」。16.1万ビューを超えたとされる（二次情報） — [explainx.ai](https://explainx.ai/blog/six-jev-clones-two-days-2026)
- **2026-09-18**: EnterpriseDNA の「AI Pulse」は、OpenJev が HN のトップページに載ったこと、fast-jev-compaction・jev-router・awesome-typesafe が同時にトレンド入りしたことを伝え、「suggests a coordinated effort」と推測している。これはベンダーの記事による解釈で、根拠は示されていない — [EnterpriseDNA](https://enterprisedna.co/resources/ai-pulse/ai-pulse-2026-09-18-jev-branded-tooling-cluster-swarms-hn-and-github)
- **2026-09-19 10:46**: HN「I built non-autoregressive decision models with RL a year ago」（Laya）、1363 points／319 comments — [HN 49765348](https://news.ycombinator.com/item?id=49765348)
- **2026-09-19**: explainx.ai の「six jev clones two days」（Yash Thakker）は、Latent.Space の「Here are 6 Clones of Jev in 2 Days」を出典に、Laya、Bespoke Nimble、Jevlike、Kev-0.5B、OpenJev、DiffusionGemmaJev の6つを挙げている — [explainx.ai](https://explainx.ai/blog/six-jev-clones-two-days-2026)

#### 2026-09-20〜09-30
- **2026-09-20**: [SiliconLabAI/OpenJev](https://github.com/SiliconLabAI/OpenJev)（07:20 作成、説明「OpenSource Jev」、LLM を並列の小さな採点器として使う TypeScript 実装）、[GPT-AGI/OpenJev](https://github.com/GPT-AGI/OpenJev)、[Zefan-Cai/Open-Jev](https://github.com/Zefan-Cai/Open-Jev) が作成された（GitHub Search API）
  - Julian Goldie 系の3つのブログ（いずれも 2026-09-21 公開）は SiliconLabAI 版を取り上げ、「~32 stars, 4 forks ... no licence file yet」と書いている。現在は 187★ — [juliangoldie.com](https://juliangoldie.com/openjev/)、[aisuccesslabjuliangoldie.com](https://aisuccesslabjuliangoldie.com/blog/openjev/)、[aiprofitboardroom.com](https://aiprofitboardroom.com/blog/openjev/)
- **2026-09-20 21:30**: TypeSafe が X で waitlist の撤廃を告知（第2問を参照） — [flaviocopes.com](https://flaviocopes.com/jev-api-key/)
- **2026-09-21**: Kev が HN で 463 points／210 comments — [HN 49783999](https://news.ycombinator.com/item?id=49783999)
- **2026-09-21**: Latent Space の対談が公開された。発言は WebFetch の要約経由で、逐語は未確認 — [Latent Space](https://www.latent.space/p/jev)
  - swyx が「There's like 50 Jev clones」と振ると、Diogo は「Well, sure ... Let's say that there is competition.」と答えた
  - Diogo は「Let's just assume that there's an industry two years from now of people who are doing similar things to us.」とも述べた
  - swyx は「you are still beating every single clone of you out there」と発言した
- **2026-09-22 06:19**: TypeSafe が新規登録を一時停止（第2問を参照）
- **2026-09-22**: HN「OpenAI is well positioned to fast-follow Jev」が 328 points／233 comments — [HN 49802161](https://news.ycombinator.com/item?id=49802161)。Show HN「JevBench」が 154 points — [HN 49800574](https://news.ycombinator.com/item?id=49800574)
- **2026-09-23**: HN「Jev in 25 Lines of Python」が 692 points／212 comments — [HN 49812769](https://news.ycombinator.com/item?id=49812769)
- **2026-09-23**: TypeSafe の MCA と AUP が「Last updated Sep 23, 2026」になった（Terms は Sep 19） — [MCA](https://typesafe.ai/legal/mca)、[AUP](https://typesafe.ai/legal/acceptable-use-policy)、[Terms](https://typesafe.ai/legal/terms)
- **2026-09-24**: mandu5/jevcompat が作成され、8つのサーバを計測（第3問を参照） — [jevcompat README](https://raw.githubusercontent.com/mandu5/jevcompat/HEAD/README.md)
- **2026-09-25**: Ollaya（「Ollama for open-source, Jev-style decision models」）が HN で 618 points — [HN 49848269](https://news.ycombinator.com/item?id=49848269)。同日、TypeSafe の「Jev Router」が OpenRouter に登録された（created 2026-09-25T19:12:40Z） — [OpenRouter models API](https://openrouter.ai/api/v1/models)
- **2026-09-28**: Jeff（「Jev-compatible 0.8B decision models」）が HN で 576 points／231 comments — [HN 49883844](https://news.ycombinator.com/item?id=49883844)。同日、HN に「SemIf-OpenJev」として投稿され、この時点でリポジトリ名が SemIf-OpenJev になっていた — [HN 49877400](https://news.ycombinator.com/item?id=49877400)
- **2026-09-29**: OpenAI が DevDay で Decisions API を発表（二次情報、第5問を参照）

#### 2026-10〜11
- **2026-10-01**: Cloudflare「Clef: Open-weight decision models, and new RL fine-tuning platform」が HN で 642 points — [HN 49923692](https://news.ycombinator.com/item?id=49923692)。TechCrunch「Amazon releases its own Jev clone as decision models flood the web」（日付は URL から、本文は未読） — [TechCrunch](https://techcrunch.com/2026/10/01/amazon-releases-its-own-jev-clone-as-decision-models-flood-the-web/)
- **2026-10-02**: Red Hat「Decision models like Jev don't beat LLM-as-a-judge or traditional classifiers」が 168 points — [HN 49933476](https://news.ycombinator.com/item?id=49933476)。同日、ihatecoding01/Simple-Jev の issue #5「add explicit TypeSafe AI trademark disclaimer in footer and README」が立った（コミュニティで免責表示を付ける動きの一例） — [GitHub Search API: issues](https://github.com/ihatecoding01/Simple-Jev/issues/5)
- **2026-10-07**: Strands Decider 2B が HN で 286 points — [HN 49987076](https://news.ycombinator.com/item?id=49987076)。Jack & Jill の導入事例が公開 — [case study](https://typesafe.ai/blog/jack-jill-jev-case-study)
- **2026-10-09**: シリーズ A の調達発表 — [series-ai](https://typesafe.ai/blog/series-ai)。HN「Typesafe AI raises $870M at $7.5B」が 446 points／357 comments — [HN 50023450](https://news.ycombinator.com/item?id=50023450)
- **2026-10-14**: Jev 1.14 公開 — [Jev 1.14](https://typesafe.ai/blog/jev-1-14)。HN で 335 points — [HN 50095353](https://news.ycombinator.com/item?id=50095353)
- **2026-10-21**: Baseten が mammoth-1 と elephant-1 を発表 — [HN 50184557](https://news.ycombinator.com/item?id=50184557)
- **2026-11-03**: 「Don’t Call It a Decision Model」公開 — [TypeSafe blog](https://typesafe.ai/blog/dont-call-it-a-decision-model)。HN（11-04）は 48 points — [HN 50371890](https://news.ycombinator.com/item?id=50371890)
- **2026-11-06**: Hightouch「A Jev that can ask Opus for help gives Opus accuracy at 4x lower cost」が 603 points — [HN 50397429](https://news.ycombinator.com/item?id=50397429)
- **2026-11-09**: Show HN「Flide: Make Jev-like decision models up to 9.5x faster」が 126 points — [HN 50421155](https://news.ycombinator.com/item?id=50421155)
- **2026-11-17 時点のスター数**（すべて GitHub Search API） — [GitHub Search API](https://github.com/search?q=openjev&type=repositories)
  - 「openjev」を含むリポジトリは 164 件
  - そのうち上位: TheoLeeCJ/SemIf-OpenJev 4,963★、razorback16/openjev 792★、ekzhang/openjev-sglang 334★、Heman10x-NGU/openJev-verdict-2.0 306★、SiliconLabAI/OpenJev 187★、zhihz/openjev 37★、GPT-AGI/OpenJev 30★
  - 名前に openjev を含まない主なクローン: NandhaKishorM/laya 35,631★、jaredpalmer/kev 10,033★、bespokelabsai/nimble 2,311★、firelex/jeff 1,603★、vinnylarouge/jevlike 1,371★、Mapika/decider 1,055★、wfzyx/von 922★、featherless-ai/simple-jev 659★、Zefan-Cai/Open-Jev 452★

#### TypeSafe の反応（まとめ）
- クローンや改名について TypeSafe が出した公式声明や商標上の要請は、ブログ、docs、HN の検索、GitHub issue の検索のどこにも見つからなかった（2026-11-17 時点）。
- 公式な発言として確認できたのは CEO の対談での発言だけで、「Well, sure ... Let's say that there is competition.」というもの（WebFetch の要約経由） — [Latent Space](https://www.latent.space/p/jev)
- 広まった「decision model」という呼び名には、DevRel の記事で距離を置いた — [Don’t Call It a Decision Model](https://typesafe.ai/blog/dont-call-it-a-decision-model)
- 1.14 の記事の「Measuring Intelligence」節は、比較相手を open weight のモデルだけに絞っている。理由は「We’re including only open weight models because we guard our validation set very closely」 — [Jev 1.14](https://typesafe.ai/blog/jev-1-14)
- 製品・契約面の動きとしては、waitlist 撤廃（9/20）、登録の一時停止（9/22）、MCA と AUP の更新（9/23、変更内容は不明）があった（第2問を参照）。

### Inferences
- 「OpenJev」は1つのプロジェクトの名前ではなくなっている。少なくとも TheoLeeCJ（現 SemIf）、razorback16、SiliconLabAI、GPT-AGI、zhihz、kw2828、alanhuangyoo が同じ名前を使っており、半ば一般名詞になった。報道によって「OpenJev」が指すものが違うのはこのため（apidog は TheoLeeCJ 版、Julian Goldie 系は SiliconLabAI 版、prismix は razorback16 版）。
- SemIf への改名は、HN で商標を指摘されてから約3.5時間後、投稿から約4.6時間後だった。TypeSafe から要請があったことを示す公開の証拠はない。自主的なリスク回避と見るのが自然だが、断定はできない。
- 名前は openjev → SemIf → SemIf-OpenJev の順に変わったと推定できる。根拠は、9/18 の apidog のリンク先、README 内の PR リンクと star-history の表記、9/28 の HN 投稿、現在の API 上の名前。
- クローン側が売りにしたのは「waitlist なし」「自宅の GPU で動く」「無料」の3点だった。TypeSafe が waitlist を撤廃したのはその直後（9/20）だが、因果関係は分からない。

### Gaps
- SemIf の改名理由についての作者本人の説明: HN、issue、コミットメッセージのどれにも見当たらなかった。
- Latent.Space の「Here are 6 Clones of Jev in 2 Days」の原文: 読めていない（explainx 経由のみ）。
- Reddit の元スレッドのスコアとコメント数: 確認していない（prismix のミラーのみ）。
- 依頼で挙がったが本文を読めなかったブログ。
  - pasqualepillitteri.it（日本語版 https://pasqualepillitteri.it/ja/news/17271/typesafe-jev-open-source-clone-muryo-rtx-3090 あり）: bot チャレンジで本文を読めず、検索結果の要約（「at least five open source clones」「SemIf and Kev ... more than 4,000 GitHub stars」）しか分からない。
  - ai.plainenglish.io（「Someone rebuilt Jev on a 3090. It beats the JSON path, not the model」）: 403 でタイトルしか分からない。
- X の投稿本文: 直接は取得していない（flaviocopes の引用と、投稿 ID から計算した時刻のみ）。

## 5. Jev と並べて語られる競合・比較対象（Laya など）と、Jev との違い

### Takeaway
最大の比較対象は Laya。Convai Innovations の Nandakishor M が作った ModernBERT 系の 421M モデルで、Apache-2.0、100以上の言語に対応し、GitHub で 35,631★。「同じことを1年前からやっていた」と主張し、HN では Jev の発表スレッドに次ぐ反響を集めた。商用の直接競合は OpenAI の Decisions API（GPT-6 Luna、入力 $0.10／100万トークン、出力無料、2026-09-29 の DevDay で発表、ただし二次情報のみ）。他に Amazon の Strands Decider 2B、Cloudflare の Clef、Baseten の mammoth-1／elephant-1、ホスティングの Codiv、SGLang の decisions endpoint がある。

### Cited Findings

#### Laya
- README の説明 — [Laya README](https://raw.githubusercontent.com/NandhaKishorM/laya/HEAD/README.md)
  - 「Multilingual, non-autoregressive System 1 decision engine. Typed decisions over 100+ languages in a single forward pass — 33 ms — trained with reinforcement learning against strictly proper scoring rules (RLCD)」
  - パラメータ数: 英語／typed-decisions のチェックポイントが約 421M、多言語版が約 322M
  - ライセンスは Apache-2.0。`laya-multilingual` は 8,192 トークンまで読める
  - 論文プレプリント「From Laya to Vega」（Preprints 2026、doi 10.20944/preprints202611.0781.v1）
  - 商用サービス Studio（studio.embedding.in）があり、新しいワークスペースに $10 のクレジットが付く
- 反響: HN 2026-09-19「I built non-autoregressive decision models with RL a year ago」が 1363 points（リンク先 laya.convaiinnovations.com） — [HN 49765348](https://news.ycombinator.com/item?id=49765348)
- explainx は Laya を「ModernBERT-large, 421M params, PPO」と紹介している — [explainx.ai](https://explainx.ai/blog/six-jev-clones-two-days-2026)
- 互換性: jevcompat の判定は 30/32 MUST。confidence を「1 − normalised entropy」で計算するため、TypeSafe の式とは自動承認の割合が大きく違う — [jevcompat README](https://raw.githubusercontent.com/mandu5/jevcompat/HEAD/README.md)
- 実地の評価例: mikesmullin のメール分類の比較では、Laya は「fastest of three and worst at the job」 — [mikesmullin README](https://raw.githubusercontent.com/mikesmullin/openjev/HEAD/README.md)

#### Laya 以外のオープン勢
- Heman10x-NGU/openJev-verdict-2.0 の説明:「Calibrated 151M Non-Autoregressive Decision Engine beating TypeSafe Jev & Laya on LocalLLaMA/typed-decisions (77.10% acc, 0.0636 Brier, 0.0144 ECE)」（自己申告） — [GitHub Search API](https://github.com/Heman10x-NGU/openJev-verdict-2.0)
- razorback16/openjev のモデル一覧には、openjev-0.1（DiffusionGemma 26B-A4B、画像も可、最大 255 選択肢）、laya-1.0（421M）、verdict-1.4（151M）などが並ぶ — [razorback16 README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)
- ホスティング: Codiv は「Hosted for free ... Sign up and get 100M input tokens, no card required」 — [razorback16 README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)

#### 商用・大手の参入
- **OpenAI Decisions API**（いずれも二次情報で、検索結果の見出しと要約のみ。OpenAI の一次資料は未確認） — [propakistani（2026-10-07）](https://propakistani.pk/2026/10/07/openai-launches-decisions-api-with-up-to-10x-faster-responses/)、[techenclave](https://techenclave.com/news/items/openai-opens-decisions-api-priced-at-0-10-per-million-input-tokens)、[letsdatascience](https://letsdatascience.com/news/openai-opens-decisions-api-public-beta-b69a1e40)、[pasqualepillitteri.it 日本語版「OpenAIがJev対抗のDecisions APIを発表」](https://pasqualepillitteri.it/ja/news/19380/openai-decisions-api-jev-taiko)、[ai-revolution.co.jp](https://ai-revolution.co.jp/media/openai-decisions-api/)
  - 2026-09-29 の DevDay で発表、モデルは GPT-6 Luna
  - 呼び出しは `client.decisions.create`／`POST /v1/decisions`、入力はテキストと画像
  - 料金は入力 $0.10／100万トークンで出力無料
  - 速度は Responses API の約10倍（約150ms 対 約1.6秒）とされる
  - 10/6〜7 ごろにパブリックベータ
- 価格の比較: Jev（$0.042／100万トークン）に対し、Decisions API は約2.4倍（上の数字から計算） — [docs: Models](https://docs.typesafe.ai/models)
- **Amazon Strands Decider 2B**: 「Amazon releases its own Jev clone」（TechCrunch、本文未読）、HN で 286 points — [TechCrunch](https://techcrunch.com/2026/10/01/amazon-releases-its-own-jev-clone-as-decision-models-flood-the-web/)、[HN 49987076](https://news.ycombinator.com/item?id=49987076)
- **Cloudflare Clef**: open-weight の decision model と RL による fine-tuning 基盤 — [HN 49923692](https://news.ycombinator.com/item?id=49923692)
- **Baseten mammoth-1／elephant-1** — [HN 50184557](https://news.ycombinator.com/item?id=50184557)

#### 品質の比較例（どれも自己申告）
- SemIf の Qwen3.5-4B は 0.845、公開されている Jev の値は 0.883（TypeSafe の公開評価から作った 102 行のサブセット） — [SemIf README](https://raw.githubusercontent.com/TheoLeeCJ/SemIf-OpenJev/HEAD/README.md)
- Reddit の投稿では、DiffusionGemma を Jev 互換にしたものが 198/201、Jev が 191/201（Matt による評価） — [prismix.dev](https://prismix.dev/news/2898fdd07155)
- 懐疑的な評価もある: Red Hat の記事は、decision model は LLM-as-a-judge にも従来の分類器にも勝てないとした — [HN 49933476](https://news.ycombinator.com/item?id=49933476)

### Inferences
- Jev とクローンの違いは、「モデル」と「インターフェース（契約）」を分けると整理しやすい。クローンの多くは、既存のオープンモデル（Qwen、Gemma、ModernBERT など）の出力確率を読むか、小さなモデルを RL や微調整で鍛えたもの。Jev の重みや RLCD を再現したものはない（多くの README が自分でそう書いている）。
- 日本語での利用について: Jev の多言語性能は公式には保証されていない。Laya の多言語版は「100+ languages」をうたうが、日本語での精度を示すデータは見つからなかった。

### Gaps
- OpenAI Decisions API の一次資料（OpenAI のドキュメントや changelog）を確認していない。提供状況（preview、beta、GA のどれか）も二次情報の間で食い違う。
- Amazon Strands Decider について、TechCrunch の本文も AWS の一次資料も確認していない。
- Laya の「1年前からやっていた」という主張を裏付ける 2025 年の公開物を確認していない。
- Jev、クローン、競合製品を日本語で比べた性能データは見つからなかった。

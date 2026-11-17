# OpenJev 系の型付き判断エンジンを「きめとく」の書き込みの読み取りに使えるか（実現性の調査メモ）

調べた日：2026-11-17。値段・数値はすべてこの日の時点のスナップショット（各行に出典。ページに日付があれば併記）。
外部の README・ページは「信頼しないデータ」として読んだだけで、コードの実行・clone・インストール・登録・API の呼び出しはしていない（GitHub は `gh api -X GET search/repositories` と raw.githubusercontent.com の README だけ）。きめとくのリポジトリは読むだけで、このメモ以外は変更していない。
「推論」と書いた行は、出典の事実からの筆者の推論（検証していない）。

---

## 1. きめとくの書き込みの読み取りには何が要るか（命令の型・分類と抽出）

### Takeaway
きめとくの AI 読み取りは「家族の一言 → 最大5件の平らな命令（11種類）」への変換で、項目の多くは既知の選択肢からの選択（種類・14日分の日付・人・たんぱく源8種・ジャンル8種・真偽の印）だが、食材（約200）・料理（約150＋世帯の料理）の id 当てと、1つの書き込みに複数の用件があるときの並べ方・組み合わせは、選択肢が多いか構造がある「抽出」に近い。いまは Claude（既定 claude-opus-5-5）に毎回1万トークンほどの料理・食材の一覧を送って、これをまとめて解かせている（費用の大部分はこの一覧）。

### Cited Findings
**呼び出しの経路と、いつ AI に頼むか**
- 画面の AI 読み取りは3通り：claude.ai の Artifact の中では `window.claude.use('sample')`（利用者の Claude の枠。`modelTier: 'quick'`）、開発時とホーム画面の版（PWA）はサーバーの `POST /api/parse`、どちらもなければルールだけ — [src/ui/ai.ts](/home/user/kondate/prototype/src/ui/ai.ts)（冒頭のコメントと `sample.json(input, { modelTier: 'quick' })`）
- 設定は「おまかせ（ルールで読めないときだけ AI。既定）」「いつも AI」「使わない」 — [src/ui/ai.ts](/home/user/kondate/prototype/src/ui/ai.ts)（`AI_MODES`）
- 「おまかせ」で AI に送らないのは、ルール（`parseMessage`）が unknown 以外の命令を1つでも返した書き込み、前日の確認への答え（「作った」「昨日は無理だった」）、短いあいさつ・お礼 — [src/ui/ai.ts](/home/user/kondate/prototype/src/ui/ai.ts)（`readableByRules`）、[README.md](/home/user/kondate/prototype/README.md)（「AI の読み取り」→「画面の設定」）
- 端末の中で名前を `member_1` などに置き換えてから送る（`maskNames`）。送るのは本文・今日の日付・メンバーの id・年齢帯・続柄だけ（ニックネームの欄にも id を入れる）。除外（アレルギー等）・献立・在庫・トークの記録は送らない。画面側の待ち時間の上限は15秒 — [src/ui/ai.ts](/home/user/kondate/prototype/src/ui/ai.ts)（`serverParseBody`、`setTimeout(..., 15_000)`）、[README.md](/home/user/kondate/prototype/README.md)
- ホーム画面の版は Netlify の関数 `/api/parse`（中身は server/parse-api.ts）。起動時に GET で1回だけ「AI で読めるか」を聞き、読めるなら POST。鍵は `KIMETOKU_ANTHROPIC_API_KEY`（Netlify の AI Gateway のクレジットを使わないよう `ANTHROPIC_API_KEY` は読まず、いつも api.anthropic.com に送る）。モデルは `KIMETOKU_MODEL`。同じ IP から1分20回まで — [netlify/functions/parse.ts](/home/user/kondate/prototype/netlify/functions/parse.ts)
- `/api/parse` は本文500字まで・メンバー20人まで。LLM の結果はエンジンの `validateCommands` で確かめ、1件も残らなければルールで読んだ結果（`source: 'rules'`）を返す。他オリジン 403・JSON でない 415・64KB 超 413・鍵なし 503 — [server/parse-api.ts](/home/user/kondate/prototype/server/parse-api.ts)、[server/interpret.ts](/home/user/kondate/prototype/server/interpret.ts)

**モデル・時間の上限・プロンプト**
- 既定モデル `claude-opus-5-5`。断られたときは API の中で別のモデルが続ける server-side fallback（ベータ `server-side-fallback-2026-07-01`。Haiku では送らない）。`max_tokens` 4096、1回の呼び出し10秒、再試行1回、全体12秒。出力は `output_config.format`（zod のスキーマ）と `effort: 'low'` — [server/llm.ts](/home/user/kondate/prototype/server/llm.ts)
- system プロンプトは変わらない部分だけ（役割・規則・例・食材マスタ「id：名前（別名）」・料理マスタ「id：名前」）で `cache_control: ephemeral`。毎回変わる部分（今日、14日分の日付と曜日の表、メンバー、世帯だけの料理、`<message>` で囲んだ本文）は user のメッセージ — [server/llm.ts](/home/user/kondate/prototype/server/llm.ts)（`buildSystemPrompt`、`buildUserContent`、`dateTable`）
- 相対的な日付はモデルに計算させず、「2026-11-09(月) 今日・今週の月曜」のような14日分の表から選ばせる。表にない日付が要る命令は出さない。「来週」「月末」「お盆」など日を決められない時期だけの用件は出さない（アプリが日付を聞く） — [server/llm.ts](/home/user/kondate/prototype/server/llm.ts)

**出力の形（命令）**
- `{ commands: [...] }`。各命令は type, date, memberRef, ingredientId, dishId, protein, genre, cancel, question, frozen を全部持ち、使わない項目は null。用件が複数なら書かれた順に5件まで。読めないとき・あいさつだけなら空配列。type・protein・genre は enum にせず文字列で受けて1件ずつ確かめる — [server/llm.ts](/home/user/kondate/prototype/server/llm.ts)（`LlmCommandSchema`）
- type は11種類：`show_week` / `show_today`（date 任意）/ `show_shopping`（date 任意）/ `today_impossible` / `want_alternatives`（date・dishId 任意）/ `absence`（date と memberRef 必須、cancel）/ `sale`（ingredientId 必須）/ `out_of_stock`（ingredientId、question）/ `have`（ingredientId、question・frozen）/ `request`（dishId・protein・genre・ingredientId のどれか、date 任意）/ `help` — [server/llm.ts](/home/user/kondate/prototype/server/llm.ts)（`COMMAND_TYPES`、`toParsedCommand`）
- プロンプトの「出さない」規則：過ぎたことの話・打ち消し・仮定では today_impossible・want_alternatives・absence を出さない。「塾」「部活」「残業」「帰りが遅い」だけ（「いらない」「食べない」がない）では absence を出さない。「〜かも」「未定」も出さない。誰か書いていない「明日飲み会」「今日はいらない」は memberRef を推測しない — [server/llm.ts](/home/user/kondate/prototype/server/llm.ts)
- memberRef は member の id か、「夫」「妻」「旦那」「主人」「上の子」「下の子」「子ども」「みんな」のような語をそのまま。question は「在庫を聞いている・買ってきてと頼む・『〜たら』の仮定・『切れてない』の打ち消し」で true。frozen は「〇〇冷凍した」 — [server/llm.ts](/home/user/kondate/prototype/server/llm.ts)
- たんぱく源は8種（chicken・pork・beef・ground・fish・seafood・egg・tofu。none は除く）、ジャンルは8種（wa・yo・chu・kr・it・eth・mx・other） — [src/engine/types.ts](/home/user/kondate/prototype/src/engine/types.ts)（`PROTEIN_LABEL`、`GENRE_LABEL`）
- ルール側の命令の型には、LLM の出力にない項目もある：absence の `tentative: 'late' | 'maybe'`、request の `dishIds`（あいまいな言い方の候補から選んでもらう）、unknown の `vague`（日を決められない時期）、memberRef が空なら「誰がいないか」を聞き返す — [src/engine/types.ts](/home/user/kondate/prototype/src/engine/types.ts)（`ParsedCommand` のコメント）、[src/engine/parser.ts](/home/user/kondate/prototype/src/engine/parser.ts)
- 料理と食材の定義行（`make('id', '名前', ...)` などの形）を grep で数えると、dishes.ts・world.ts・extras.ts・ingredients.ts の合計で388行（料理と食材の合計の目安。依頼文の「料理約150・食材約200」と矛盾しない） — [src/data/](/home/user/kondate/prototype/src/data/)（2026-11-17 に grep で計数）

**費用（いま）**
- 1回の読み取りで料理と食材の一覧（1万トークンほど）を送る。Opus 5.5 で1回およそ0.05〜0.07ドル（数分のうちに続けて読むとキャッシュで0.01〜0.03ドル）、Haiku 5.5 で1回およそ0.002ドル（2026年11月の値段）。Netlify では関数の実行時間（1GB の関数で1時間＝10クレジット。1,000回でおよそ10クレジット）とリクエスト数（1万回で2クレジット）を月300クレジットから使う — [README.md](/home/user/kondate/prototype/README.md)（「ホーム画面の版で AI を使うには（主催者）」→「費用」）

### Inferences
- 推論：項目ごとの性質は次のとおり（判断エンジンへの載せやすさの順）。

| 項目 | 中身 | 候補の数 | 性質 |
|---|---|---|---|
| cancel / question / frozen と「出さない」条件（過去・打ち消し・仮定・かも・遅くなるだけ・人が書かれていない・時期だけ） | 真偽 | 2 | 二値分類（いまはプロンプトの規則。判断エンジンの yes/no にそのまま載る） |
| protein / genre | 既知の enum | 8＋なし | 分類 |
| date | 14日分の表から選ぶ | 14＋なし＝15 | 分類（相対日付の解釈はモデル、計算は表） |
| memberRef | id（20人まで）か続柄・自分を指す語 | 十数〜30程度 | 分類（候補を列挙すれば） |
| type | 11種類＋「なし」 | 12 | 分類。ただし1つの書き込みに最大5件・順序つき＝複数ラベル＋並べ替え |
| ingredientId / dishId | マスタの id | 約200 / 約150＋世帯の料理 | 大きな集合からの選択。実際は「文の中のどの語が食材・料理か」を見つけて id に正規化する抽出に近い |
| 複数の用件の組み合わせ（「水曜は夫、金曜は上の子がいない」） | 日付と人の対応 | — | 構造の抽出。1問ずつ独立に答える判断エンジンが最も苦手なところ |

- 推論：Claude の費用のほとんどは「毎回1万トークンのマスタを送ること」から来ている。食材・料理の候補をコードで先に絞れば、判断エンジンでも Claude でも、送る量は大きく減らせる（判断エンジンだけの利点ではない）。

### Gaps
- 実際の家族の書き込みのうち、何割が「おまかせ」で AI に送られるか、複数の用件を含む書き込みが何割かは、リポジトリからは分からない（試用の記録の集計はこの調査の範囲外）。
- いまの Claude の経路の実際の遅延（p50/p95）と正解率は、リポジトリに数値がない（README は「1回数秒」「Haiku の正しさは家族の書き込みで確かめてから選ぶ」とだけ書く）。

---

## 2. 型付き判断エンジンでどこまで覆えるか（ハイブリッドと、確率で「聞き返す」）

### Takeaway
分類の部分（種類・日付・人・たんぱく源・ジャンル・真偽の印・「出さない」条件）は、Jev 型の `noul`（yes/no）・`choice`・`score` の質問にそのまま書き直せ、1回のリクエストで複数の質問を同じ文脈に聞ける。食材・料理は候補が多すぎるので、ルールの別名照合で候補を十数件に絞ってから選ばせる形が現実的。複数の用件の組み合わせは苦手なので、当面は Claude（Haiku）に残す「ルール → 判断エンジン（確率が高いときだけ採用）→ Claude → ルール」の重ね方がよい。確率でしきい値を決めて「聞き返す」設計は筋がよいが、出てくる確率はそのままでは較正されていない実装もあり、きめとく自身の日本語データで温度を合わせる必要がある。

### Cited Findings
**API の形（Jev 互換）**
- `POST /v1/systemone` に `{state, model, questions}` を送り、質問の型は `noul`（yes/no。`P(yes)` を返す）、`choice`（`criteria: {name: description}`。`{choice, probabilities, confidence}`）、`score`（1〜10段階。`Σ i·pᵢ` の期待値）。答えはモデルの確率から読むので形から外れない — [razorback16/openjev README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)
- OpenJev は TypeSafe の SDK と OpenAI の Decisions API（`client.decisions.create`）の両方の形を受ける。多くの質問は約12問ずつのまとまりで並列に読む。拡張 `sequential` を付けると、まとまりを順に読み、前の答えを見られる — [razorback16/openjev README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)
- `state`・`instructions`・候補の説明は文字列のほか JSON オブジェクト・配列も可。チャットのメッセージの列も state にできる（openjev-sglang）— [ekzhang/openjev-sglang README](https://raw.githubusercontent.com/ekzhang/openjev-sglang/HEAD/README.md)

**候補の数の上限**
- Jev：「cardinality up to 255」。それより多いときは「scoring then choosing」の2段階 — [TypeSafe blog（2026-09-15）](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- OpenJev（DiffusionGemma）・Laya・CLM・JevK5・Clef は255まで、Verdict は24まで。Laya は候補が256トークンを分け合うので「20くらいまで、多ければ質問を分ける」。JevK5 は16を超えると複数回に分けて読み、合わせる — [razorback16/openjev README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)
- openjev-sglang は既定で1問あたり2〜64択（65択は拒否）— [ekzhang/openjev-sglang README](https://raw.githubusercontent.com/ekzhang/openjev-sglang/HEAD/README.md)
- zhihz/openjev は1問あたり2〜8択 — [zhihz/openjev README](https://raw.githubusercontent.com/zhihz/openjev/HEAD/README.md)

**確率の意味と較正**
- 返す確率は「与えた候補の中での条件つき」。使う業務のデータで較正・検証すること — [SemIf README](https://raw.githubusercontent.com/TheoLeeCJ/SemIf-OpenJev/HEAD/README.md)
- 「該当なし」の候補は自動では足さない（zhihz）。Verdict は「insufficient evidence」の候補を足すが、OpenJev は Jev の形に合わせてそれを除き、残りを足して1にする — [zhihz/openjev README](https://raw.githubusercontent.com/zhihz/openjev/HEAD/README.md)、[razorback16/openjev README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)
- OpenJev の `confidence` は `1 − H(p)/ln K`（分布のエントロピーから計算。モデルが自分で言う数ではない）— [razorback16/openjev README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)。openjev-sglang は同じ定義で「プロンプトと候補の並び順に依存し、正しさの較正された推定ではない」と明記 — [ekzhang/openjev-sglang README](https://raw.githubusercontent.com/ekzhang/openjev-sglang/HEAD/README.md)
- SemIf は業務ごとの温度スケーリングを入れ、out-of-fold の ECE が authored decisions で 0.068→0.038（T=1.23）、WANLI で 0.208→0.069（T=2.50）。較正は選ぶ候補を変えない — [SemIf README](https://raw.githubusercontent.com/TheoLeeCJ/SemIf-OpenJev/HEAD/README.md)
- TypeSafe は Jev を「Calibrated: higher confidence means higher accuracy」と主張（自社の主張）— [TypeSafe blog](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- openJev-verdict-2.0 は確信度の専用の頭（confidence head）で ECE 0.0144。英語の業務データ（2,000件）で、カバー率80%で正解率83.44%、60%で89.00%、50%で91.40%、30%で95.17%（自動で処理する分を絞るほど正確）— [Heman10x-NGU/openJev-verdict-2.0 README](https://raw.githubusercontent.com/Heman10x-NGU/openJev-verdict-2.0/HEAD/README.md)
- 候補の並べ替えで答えが変わる率：Verdict 2.0 は 4.76%（2,918件）、同 README によれば Kev-0.5B は 7.41% — [openJev-verdict-2.0 README](https://raw.githubusercontent.com/Heman10x-NGU/openJev-verdict-2.0/HEAD/README.md)
- 量子化や実行経路で確率は動く：zhihz の FP16 と MLX 8-bit は上位の答えは364件すべて一致したが、確率の差は最大0.1854。SemIf の高速経路（BF16）は777件中5〜6件で argmax が変わった — [zhihz/openjev README](https://raw.githubusercontent.com/zhihz/openjev/HEAD/README.md)、[SemIf README](https://raw.githubusercontent.com/TheoLeeCJ/SemIf-OpenJev/HEAD/README.md)

**速さ（生成と比べて）**
- 同じ Qwen3.5-4B・同じ文脈・21個の yes/no を RTX 3090 で：確率を直接読むと1.023秒、短い JSON 配列を生成すると5.332秒（111トークン）。答えの一致は21問中18問 — [SemIf README](https://raw.githubusercontent.com/TheoLeeCJ/SemIf-OpenJev/HEAD/README.md)

**きめとくの側にある「聞き返し」の仕組み**
- absence の memberRef が空なら「誰がいないか」を聞き返す、`vague` は日付か曜日で送ってもらう、request の `dishIds` は候補から選んでもらう — [src/engine/types.ts](/home/user/kondate/prototype/src/engine/types.ts)（`ParsedCommand` のコメント）
- LLM の結果は必ず `validateCommands` で検証（マスタにない食材・料理、ありえない日付、家族にいない member の id を捨てる）— [README.md](/home/user/kondate/prototype/README.md)（「LLM を使うところ・使わないところ」）

### Inferences
- 推論：質問の設計案（1書き込み＝1リクエスト、state は名前を置き換えた本文と今日の日付だけ）
  - 種類：11種類それぞれを `noul`（「この書き込みは〇〇を伝えているか」）にして複数ラベルで読む。あるいは「なし」を含む12択の `choice`。複数ラベルの方が「卵切れた、あと金曜はカレー」に対応しやすい。
  - 日付：14日分の表＋「日付の指定なし」の15択 `choice`（候補の説明に「今日」「明日」「今週の水曜」などの印を入れる。いまの日付の表をそのまま候補にできる）。today_impossible と want_alternatives の振り分け（今日なら前者、ほかの日なら後者）は、いまのルールと同じくコードで決める（[parser.ts](/home/user/kondate/prototype/src/engine/parser.ts) の 857〜858 行目付近と同じ考え方）。
  - 人：member の id＋続柄の語＋自分を指す語＋「書かれていない」の `choice`。
  - 印：cancel・question・frozen と「過去の話か」「打ち消しか」「仮定か」「まだ決まっていない（かも）か」「遅くなるだけか」を `noul` に分ける（いまプロンプトの文章で頼んでいる規則が、1つずつ確率つきで見えるようになる）。
  - 食材・料理：ルールの別名照合で候補を上位16件以内（JevK5 が1回で読める数、Verdict の24以内）＋「該当なし」に絞ってから `choice`。マスタ全体（約200・約150）を1問に入れると、255の上限には入るが、Laya の注意（候補が多いと1つあたりの文字が削られる）から推して精度が落ちやすい。
  - たんぱく源・ジャンル：8＋なしの `choice`。
- 推論：確率で「聞き返す」設計は、きめとくの既存の聞き返し（日付・人・候補）にそのままつながる。項目ごとにしきい値を決め、低ければ自動で実行せずに聞き返すか Claude に回す。状態を変える命令（absence・today_impossible・want_alternatives・out_of_stock・have）は高いしきい値、見るだけの命令（show_*・help）は低いしきい値、とまちがいの重さで分けるのがよい。
- 推論：`confidence`（エントロピー）を正しさの確率として使ってはいけない。日本語の家族の書き込みでの正解ラベルつきデータを作り、項目ごとに温度を合わせ、カバー率と正解率の曲線（Verdict 2.0 の表と同じ形）でしきい値を選ぶ必要がある。
- 推論：判断エンジンは「閉じた世界」で答える（与えた候補のどれか）。いまの Claude の「読めなければ空配列」に当たるものとして、すべての質問に「該当なし」「書かれていない」を明示的に入れ、その候補の較正も確かめる必要がある。
- 推論：複数の用件を順序つきで5件まで、日付と人を組み合わせて返すことは、1問ずつ独立に答える仕組みでは素直に表せない。当面は「種類の yes/no が2つ以上立った」「日付や人の候補が2つ以上高い」書き込みを Claude（Haiku）に回すのが安全。
- 推論：重ね方の案は「ルール（いまどおり）→ 判断エンジン（全項目がしきい値以上で、validateCommands を通ったときだけ採用）→ Claude（Haiku 5.5。複数用件・低い確率のとき）→ ルール」。Artifact 版（claude.ai の `window.claude.use('sample')`）は Claude しか使えないので、判断エンジンを使えるのはホーム画面の版（Netlify の関数）と LINE のサーバーだけ。

### Gaps
- Jev 1.14 で増えた「Box」型の質問（[TypeSafe docs](https://docs.typesafe.ai/models)）の中身は確かめていない（抽出に使えるものかは不明）。
- 日本語の家族の書き込みで、種類の複数ラベル `noul` と12択 `choice` のどちらが正確か、候補の説明を日本語と英語のどちらで書くべきかの証拠は見つからなかった（実験で決めるしかない）。
- 「候補の数が多いほど精度が落ちる」ことの、きめとくに近い条件での数値は見つからなかった。

---

## 3. どこで動かせるか：ホスティング・1,000回あたりの費用・遅延

### Takeaway
Netlify の無料プランの関数（1024 MB・0.5 vCPU 相当・60秒・GPU なし・Node.js）の中で動かせるのは、せいぜい英語専用の小さいエンコーダー（Verdict 151M など）までで、日本語が読める 4B 級（Q4 で約3 GB）は入らない。現実的なのはホスト型の API：Cloudflare Workers AI の Clef-flash（$0.038/百万入力トークン、1日1万ニューロンまで無料）・TypeSafe Jev（$0.042/百万入力トークン）・Codiv（OpenJev の無料の実験、1億トークン）で、1,000回あたり数セント〜数十セントと、Claude（Opus で約50〜70ドル、Haiku で約2ドル）より1〜3桁安い。自前の GPU（Modal などのサーバーレス GPU・自宅の RTX 3090）は、家族アプリのまばらな呼び出しでは起動の待ちと待機の課金で割に合わない。

### Cited Findings
**Netlify の関数の制約**
- 既定：リージョン `cmh`（US East, Ohio）、メモリ 1024 MB、同期の実行は60秒（変えられない）、バックグラウンド15分、バッファの入出力 6 MB。メモリは 1024〜4096 MB、vCPU は 0.5〜2.0（0.5 が 1024 MB、2.0 が 4096 MB に対応）。メモリ・vCPU の設定はクレジット制の Pro と Enterprise だけ、リージョンの選択も Pro と Enterprise（東京 `nrt` もある）。ランタイムは Node.js（Lambda の Node.js、既定のフォールバックは Node.js 24）— [Netlify Docs: Functions configuration（2026-11-17 取得）](https://docs.netlify.com/build/functions/configuration/)、[Netlify Docs: Functions API](https://docs.netlify.com/build/functions/api/)
- 関数の実行時間は 1GB の関数で1時間＝10クレジット、リクエストは1万回で2クレジット、無料プランは月300クレジット（足せない）— [README.md](/home/user/kondate/prototype/README.md)（2026年11月に Netlify の説明で確かめた、とある）

**CPU だけで動く移植**
- SemIf は llama.cpp の裏方で CUDA なしに GGUF から同じプロンプトを採点できる（例：`Qwen_Qwen3.5-4B-Q4_K_M.gguf`）— [SemIf README](https://raw.githubusercontent.com/TheoLeeCJ/SemIf-OpenJev/HEAD/README.md)
- SemIf のブラウザ版の大きさと精度：Qwen3-0.6B Q8_0 639 MB（authored の balanced accuracy 0.440）、MiniCPM5-2B Q4_K_M 1.56 GB（0.686）、Qwen3.5-4B Q4_K_M 3.01 GB（0.813）。公開されている Jev の結果は TypeSafe の102件の部分集合で一致率0.883（SemIf 4B は0.845）— [SemIf README](https://raw.githubusercontent.com/TheoLeeCJ/SemIf-OpenJev/HEAD/README.md)
- openjev.cpp（llama.cpp の fork）の Apple M5 での1件の短い判断：OpenJev 0.8B Q4 は CPU 101 ms／Metal 41 ms、4B Q4 は CPU 967 ms／Metal 264 ms、Laya F16 は CPU 356 ms／Metal 37 ms（モデルの読み込みは除く）— [cappuch/openjev.cpp README](https://raw.githubusercontent.com/cappuch/openjev.cpp/HEAD/README.md)
- Verdict 2.0（149.6M）は1判断20〜25 ms、ブラウザの WebGPU（600 MB 未満）で Chrome と Edge で動き「Zero data exfiltration」— [openJev-verdict-2.0 README](https://raw.githubusercontent.com/Heman10x-NGU/openJev-verdict-2.0/HEAD/README.md)
- OpenJevSwift は Mac と iPhone アプリの中で Verdict・Laya（Core ML）、DiffusionGemma・JevK5（MLX）を動かす。Verdict は約310 MB のダウンロード、Verdict・Laya は iOS 18 以上。JevK5 は iOS 向けにビルドできるが iPhone ではまだ動かしていない — [Algorythm-Canada/OpenJevSwift README](https://raw.githubusercontent.com/Algorythm-Canada/OpenJevSwift/HEAD/README.md)
- OpenJev-Cactus は実体が「Needle FastAPI Backend」（cactus-needle の Python パッケージ、ツール呼び出しが主）で、`/v1/systemone` も持つ。遠隔計測を切るには `NEEDLE_TELEMETRY=0` — [SiliconLabAI/OpenJev-Cactus README](https://raw.githubusercontent.com/SiliconLabAI/OpenJev-Cactus/HEAD/README.md)

**GPU（自前）**
- OpenJev（DiffusionGemma 26B-A4B NVFP4）は 24 GB 以上の NVIDIA GPU が必要（RTX PRO 6000 Blackwell で試験）、重みは約18 GB。状態49トークンなら1件ずつで p50 30 ms、2,047トークンで 83 ms — [razorback16/openjev README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)
- RTX 3090 での実測：JevK5（Qwen3.5-4B＋LoRA、bf16、重み7.9 GB）は3問（約700トークン）で116 ms、10択1問で75 ms。CLM（Qwen3-8B-FP8）は約550トークン3問で99 ms — [razorback16/openjev README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)
- Verdict と Laya は GPU なら合わせて約3.7 GB（bf16）、16問・短い文脈で Laya 10 ms・Verdict 7 ms（RTX PRO 6000）。CPU でも動く — [razorback16/openjev README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)

**サーバーレス GPU**
- Modal の GPU の秒単価：B200 $0.001736、H100 $0.001097、A100 80GB $0.000694、L40S $0.000542、A10 $0.000306、L4 $0.000222、T4 $0.000164。Starter は月額なしで毎月 $30 分の計算資源つき（モデル API のトークンは対象外）— [Modal pricing（2026-11-17 取得）](https://modal.com/pricing)
- openjev-sglang は Modal の B200 1台／コンテナで Qwen3.6-35B-A3B を動かす。5分使われないとゼロまで縮み、縮んだあとは起動中 503 を返す。初回は重みのダウンロードとカーネルのコンパイル、以降もキャッシュは使うが起動のたびに CUDA graph の capture が走る。既定のエンドポイントは `unauthenticated=True` — [ekzhang/openjev-sglang README](https://raw.githubusercontent.com/ekzhang/openjev-sglang/HEAD/README.md)

**ホスト型の API**
- TypeSafe Jev：入力 $0.042／百万トークン（$42／十億）、出力は無料。`jev-latest` と `jev-preview` は `jev-1.14.0`（2026-10-14 から）を指す。1リクエスト64k・1問32kトークン（特別なヘッダーで262k）。レート制限は組織ごと。無料枠の記載なし — [TypeSafe Docs: Models（2026-11-17 取得）](https://docs.typesafe.ai/models)
- Jev の応答時間は「70ms-500ms」（西海岸のノート PC から測った自社の数値）、早期アクセス — [TypeSafe blog（2026-09-15）](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- 第三者の数値は食い違う：AIML API は入力 $0.0577668／百万、新規アカウントに $5 の無料クレジットがあるとする記事と、無料枠はないとする記事がある（検索結果の要約。一次情報ではない）— [eesel.ai](https://www.eesel.ai/blog/typesafe-jev-pricing)、[aimlapi.com](https://aimlapi.com/models/typesafe-jev-latest)
- Cloudflare Workers AI：無料枠は1日1万ニューロン、超えた分は Workers Paid で $0.011／1,000ニューロン。`@cf/cloudflare/clef` は $0.240／百万入力トークン（21,818ニューロン／百万）、`@cf/cloudflare/clef-flash` は $0.038／百万入力トークン（3,455ニューロン／百万）。出力の値段の記載なし。ページの最終更新 2026-11-12 — [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- 食い違い：Clef-flash を $0.09／百万とする第三者の記事がある（公式ページは $0.038）— [eesel.ai（独語）](https://www.eesel.ai/de/blog/cloudflare-clef-preise)（検索結果の要約）、[Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- Clef（Qwen3.8-27B ベース）と Clef-flash（Qwen3.5-9B ベース）は Jev API 互換、Workers AI でホスト。Cloudflare の Jev Decision Index での遅延の中央値／p95：Clef 209.3／238.6 ms、Clef-flash 38.8／122.4 ms、Jev 524.1／536.0 ms。文脈は64k — [Cloudflare blog（2026-10-01 公開、11-09 更新）](https://blog.cloudflare.com/clef-decision-models)
- Codiv（razorback16 の OpenJev をホスト）：無料プランは $0・カード不要で、1アカウント1億 System One トークン＋1千万の文章生成トークン、全モデル、鍵10本まで、鍵ごとに毎分60リクエスト。「Free public experiment」で、無料は「while the experiment runs」。有料の値段は載っていない — [codiv.ai（2026-11-17 取得）](https://codiv.ai)、[razorback16/openjev README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)
- OpenJev（Codiv の本番設定）では、1リクエストは「state＋約150トークン」で課金される（README の例の3問）— [razorback16/openjev README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)
- OpenRouter の `~typesafe/jev-latest`：Jev 系の最新に転送する別名で、表示上は無料、実際は応答したモデルの値段で課金、文脈は64kまで、公開日は英語版 2026-09-17・韓国語版 2026-09-18（検索結果の要約。ページは WebFetch で 404 になり本文を確かめられなかった。ページは Jev 1.13 を表示しているとの要約で、TypeSafe 公式の `jev-latest`＝1.14.0 とずれている）— [OpenRouter（検索結果）](https://openrouter.ai/models/~typesafe/jev-latest)
- DigitalOcean の Serverless Inference でも System One API として Jev が使える（検索結果の見出しのみ。値段は未確認）— [DigitalOcean Docs](https://docs.digitalocean.com/products/inference/how-to/use-system-one-api/)

### Inferences
- 推論（1回あたりのトークン）：state（名前を置き換えた本文＋今日の日付、数十トークン）と、質問10問前後（種類12択・日付15択・人・印6問・食材と料理の絞った候補・たんぱく源・ジャンル）で、問いと候補の分がおよそ1,000〜1,200トークン。質問ごとに state を読み直す実装もあるので、1回あたり 1,000〜3,000 入力トークンと見ておく（いまの Claude の約1万トークンより少ないのは、マスタ全体を送らないから）。
- 推論（比較表。1回 1,000〜3,000 入力トークン、値段は上の出典の 2026-11 時点）：

| 選択肢 | 動く場所 | 1,000回あたりの費用（目安） | 遅延（目安） | 主な制約 |
|---|---|---|---|---|
| いま：Claude Opus 5.5 | Anthropic | $50〜70（キャッシュが効けば $10〜30） | 数秒（上限12秒） | 費用 |
| Claude Haiku 5.5 | Anthropic | 約 $2 | 未計測 | 日本語の正しさは未確認 |
| TypeSafe Jev 1.14 | TypeSafe | $0.04〜0.13 | 70〜500 ms（自社）、中央値524 ms（Cloudflare 計測）＋網の往復 | 早期アクセス、日本語の記載なし |
| Cloudflare Clef | Workers AI | $0.24〜0.72（1日およそ150〜460回までは無料枠） | 中央値209 ms | 日本語の記載なし |
| Cloudflare Clef-flash | Workers AI | $0.04〜0.11（1日およそ960〜2,900回までは無料枠） | 中央値39 ms、p95 122 ms | 日本語の記載なし |
| Codiv（OpenJev 各モデル） | codiv.ai | $0（1億トークン＝およそ3.3万〜10万回分） | モデルの時間30〜83 ms＋網の往復 | 実験。終わる可能性、運営の法人名なし |
| OpenRouter jev-latest | OpenRouter→TypeSafe | Jev と同程度と思われる（未確認） | Jev＋中継 | ページを確かめられていない |
| Modal で自前（L4 に 4B 級） | Modal | まばらな呼び出しでは1回ごとに「起動＋5分の待機」：L4 で約 $0.07〜0.09／回（1,000回で $70〜90）。常時起動は L4 で月約 $575、B200 で月約 $4,500 | 起動中は 503（数十秒以上と推測） | 起動の待ちが12〜15秒の上限を超える |
| 自宅の RTX 3090 | 家の PC | 電気代と機材（未計算） | 75〜116 ms（JevK5） | 家の PC をインターネットに公開する手間と止まるリスク |
| Netlify 関数の CPU | Netlify | クレジットは安い（2秒／回なら 1,000回で約5.6クレジット） | 不明（0.5 vCPU 相当） | 1024 MB に 4B（Q4 で3.01 GB）は入らない。小さいモデルは英語のみ |
| 端末の中（WebGPU） | 家族のスマホ | $0 | 不明 | 0.6〜3 GB のダウンロード、日本語の小さいモデルがない |

  - 計算：Workers AI の無料枠 10,000ニューロン／日 ÷ 21,818ニューロン／百万トークン ≈ 46万トークン／日（Clef）、÷ 3,455 ≈ 289万トークン／日（Clef-flash）。Modal L4：$0.000222×3,600 ≈ $0.80／時、×720時間 ≈ $575／月。5分の待機＝300秒×$0.000222 ≈ $0.067。B200：$0.001736×3,600 ≈ $6.25／時、×720 ≈ $4,500／月。Netlify：2秒×1 GB×1,000回 ≈ 0.56 GB 時 ≈ 5.6クレジット。
- 推論：ホスト型の判断 API を Netlify の関数から呼ぶなら、関数は中継するだけなので実行時間（＝Netlify のクレジット）も Claude のときの「数秒」より短くなる。関数は無料プランでは US East（Ohio）から呼ぶことになる。
- 推論：家族アプリの呼び出しは「おまかせ」でルールで読めないものだけなので、1日に数回〜数十回程度と推測される。この量なら Workers AI の無料枠（Clef-flash で1日約1,000回以上）や Codiv の無料枠の範囲に十分収まり、費用はほぼ0。逆に、量が少ないことが自前 GPU（待機の課金）を不利にする。
- 推論：Netlify の関数の中で直接動かす案は、英語専用の Verdict などを ONNX などで Node.js から動かせば 1024 MB に入る可能性はあるが（未検証）、日本語が読めないので意味がない。日本語のモデルを小さく作り直す（4章）まで、CPU の案は保留。

### Gaps
- Netlify の関数のバンドルの大きさの上限（モデルの重みを同梱できるか）は、取得した Netlify のページに数値がなかった。
- Modal でゼロまで縮む待ち時間（5分）を短くできるか、実際の起動時間（秒）は確かめていない（openjev-sglang の README は「起動中は 503」とだけ書く）。
- Workers AI を REST で外（Netlify）から呼ぶときの、無料枠の扱いと使いすぎの上限の設定は確かめていない。Workers AI の出力トークンの値段も公式ページになかった。
- OpenRouter のページ本文と、OpenRouter 経由の手数料・データ方針は確かめられなかった（404）。
- 自宅 GPU の電気代（日本の電気料金）は調べていない。
- OpenAI の Decisions API（`client.decisions.create`、OpenJev README に記載）も同種のホスト型の選択肢だが、値段・日本語・規約は調べていない — [razorback16/openjev README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)

---

## 4. 日本語：短い家族のチャット（「水曜は夫が飲み会」「鶏むねが安い」「卵切れた」）を読めるか

### Takeaway
OpenJev 系で評価されている数値はほぼすべて英語（と一部中国語）で、日本語の判断（型付きの選択・yes/no）の評価は見つからなかった。LLM を土台にした系統（Qwen3.5-4B・Qwen3.5-9B（Clef-flash）・Qwen3.8-27B（Clef）・DiffusionGemma）は多言語のモデルなので短い日本語は読める見込みが高いが、数値の裏づけはない。小さいエンコーダー（Verdict・Laya＝英語の ModernBERT）は日本語には向かない。日本語の ModernBERT（sbintuitions/modernbert-ja、MIT）はあるので、日本語の小さい判断モデルを作ることは技術的にはできるが、ラベルつきデータと手間が要る。

### Cited Findings
- Qwen3.5-4B：Apache-2.0、パラメーター4B、文脈262,144トークン、「201 languages and dialects」に対応。多言語の指標は MMMLU 76.1、MMLU-ProX 71.5（29言語の平均）、INCLUDE 71.0、WMT24++ 66.6（55言語の平均）。日本語だけの数値はモデルカードにない — [Hugging Face: Qwen/Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B)
- 日本語の記事の印象：「性能は9Bのほうが上ですが、4Bも十分に日本語で、日常的に運用できるレベル」（検索結果の要約。本文は未取得）— [GIZMODO JAPAN（2026-03）](https://www.gizmodo.jp/2026/03/qwen_3_5_9b_4b.html)
- Nejumi（W&B の日本語 LLM リーダーボード）で Qwen3.5 の日本語の数値は確かめられなかった。二次情報のブログの「0.711」は Qwen3.5 のものか Nemotron Nano 9B JP のものかがはっきりしない — [lilting.ch](https://lilting.ch/en/articles/japanese-llm-options-compared)（検索結果の要約）、[Nejumi LLM Leaderboard3](https://wandb.ai/wandb-japan/llm-leaderboard3/reports/Nejumi-LLM-Leaderboard3--Vmlldzo4NDkwODEy)
- SemIf の品質の数値は authored decisions・WANLI・TypeSafe の部分集合・Every の課題で、日本語の課題はない — [SemIf README](https://raw.githubusercontent.com/TheoLeeCJ/SemIf-OpenJev/HEAD/README.md)
- Verdict 2.0 は英語の業務データ `LocalLLaMA/typed-decisions`（金融・セキュリティ・サポートなど2,000件）で評価。Verdict の重みは71トークン未満の文脈で学習 — [openJev-verdict-2.0 README](https://raw.githubusercontent.com/Heman10x-NGU/openJev-verdict-2.0/HEAD/README.md)
- Laya は「English ModernBERT-large plus the decision head」— [cappuch/openjev.cpp README](https://raw.githubusercontent.com/cappuch/openjev.cpp/HEAD/README.md)。Verdict は ModernBERT-base＋GLiClass の頭 — [razorback16/openjev README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)
- zhihz/openjev は英語と中国語の入力だけ（Qwen3-4B-Instruct-2507）。Belebele の32話×4言語の部分集合で、英→英30/32、英→中32/32、中→英31/32、中→中32/32 — [zhihz/openjev README](https://raw.githubusercontent.com/zhihz/openjev/HEAD/README.md)
- JevK5 は JevBench の公開231問で87.4%（OpenJev での再現）。16択を超える問題は含まない — [razorback16/openjev README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)
- TypeSafe の Models のページは入力を「natural-language text」とだけ書き、対応言語の記載はない — [TypeSafe Docs: Models](https://docs.typesafe.ai/models)。Jev の発表記事も言語に触れていない — [TypeSafe blog](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- Cloudflare の Clef の記事も対応言語・多言語の評価に触れていない — [Cloudflare blog](https://blog.cloudflare.com/clef-decision-models)
- 日本語で Jev を試した記事（TypeScript でのサポートの振り分け）や解説記事はあるが、日本語での精度の数値は見つからなかった（検索結果の要約）— [azukiazusa.dev](https://azukiazusa.dev/blog/jev-support-routing.md)、[WEEL](https://weel.co.jp/?p=126168)、[ai-souken.com](https://www.ai-souken.com/article/what-is-jev)
- 日本語の ModernBERT：SB Intuitions の modernbert-ja は 30M・70M・130M・310M、日本語と英語4.39兆トークンで事前学習、語彙102,400、系列長8,192、MIT（検索結果の要約）。NII／LLM-jp の llm-jp-modernbert もある — [Hugging Face: sbintuitions/modernbert-ja-130m](https://huggingface.co/sbintuitions/modernbert-ja-130m)、[arXiv 2504.15544](https://arxiv.org/html/2504.15544v1)

### Inferences
- 推論：「卵切れた」（out_of_stock・egg）、「鶏むねが安い」（sale・chicken_breast）のような1用件・語がはっきりした文は、ルールの別名照合でも読めることが多く、そもそも「おまかせ」では AI に送られない。AI に回るのは、ルールが読めない言い回し（省略・方言・打ち消し・仮定・「かも」・複数の用件）なので、判断エンジンの日本語の評価も、その難しい文を中心にしないと意味がない。
- 推論：「塾」は遅くなるだけで欠席ではない、「飲み会」は欠席、「明日飲み会」は誰か書いていないので出さない、のような、きめとく固有の約束は、いまプロンプトに文章で書いてある。判断エンジンでは、これを質問の指示と候補の説明に書き直すことになる。汎用の判断モデル（英語の業務データで学習したもの）がこの約束にどこまで従うかは、日本語の評価セットで測るしかない。
- 推論：Verdict・Laya（英語のエンコーダー）は日本語の家族の書き込みには使えない前提で考える。端末の中や Netlify の関数の中で動かしたいなら、modernbert-ja-130m に GLiClass 風の頭を付けて、合成した日本語の書き込みで学習し直す必要がある（Verdict 2.0 は GTX 1660 Ti で8.8時間の学習と書いているので、規模としては個人でも可能 — [openJev-verdict-2.0 README](https://raw.githubusercontent.com/Heman10x-NGU/openJev-verdict-2.0/HEAD/README.md)）。
- 推論：LLM 系の判断エンジンでも、量子化や実行環境で確率が動く（2章）ので、日本語でのしきい値は、使うモデル・量子化・版ごとに測り直す必要がある。

### Gaps
- OpenJev 系・Jev・Clef のどれについても、日本語の判断（分類・yes/no）の評価結果は見つからなかった。
- DiffusionGemma（Gemma 系）の日本語の能力の資料は、この調査では取得していない。
- Qwen3.5 の日本語専用ベンチマーク（JMMLU・Japanese MT-Bench・Nejumi など）の一次情報の数値は確かめられなかった。
- issoh.co.jp の「日本語での精度の扱い」の記事は 403 で本文を読めなかった — [issoh.co.jp](https://www.issoh.co.jp/md/tech/18238)

---

## 5. プライバシー・規約・ライセンス・「Jev」の商標

### Takeaway
どのホスト型でも、外に出るのは「名前を置き換えた本文＋質問と候補（日付・人の id・絞った食材と料理の名前）」で、マスタ全体を送るいまの Claude の経路より少ない。データの扱いは、TypeSafe（顧客のリクエストで学習しない。ZDR は enterprise のみ）・Cloudflare（読まない・保存しない・学習しない、と明記）・Codiv（本文を記録しない・学習しない、ただし運営は個人の連絡先だけで法人名がない）で差がある。コードと重みのライセンスは大半が MIT／Apache-2.0 で商用の家族アプリに使えるが、README と GitHub の判定が食い違うもの・ライセンスがないもの・他社モデルからの蒸留を含むものがある。「Jev」の名前は、どの互換プロジェクトも TypeSafe の名前として扱っており、きめとくの画面や説明に「Jev」「OpenJev」を出すのは避けるべき。

### Cited Findings
**いまの経路で外に出るもの**
- Anthropic には、名前を除いた本文、日付の表、料理と食材の名前と id の一覧が届く。関数は本文を保存せず、ログにも出さない（失敗の種類だけ）— [README.md](/home/user/kondate/prototype/README.md)（「AI の読み取り」→「送るもの」）

**ホスト型 API のデータの扱い**
- TypeSafe：「Jev is not trained on customer requests or responses」。顧客のデータで fine-tune・LoRA をせず、全アカウントで同じ重み。ZDR（zero data retention）は enterprise 向けで Legal のページに — [TypeSafe Docs: Models](https://docs.typesafe.ai/models)
- Cloudflare：fine-tuning を選ばない限り、リクエストと応答を読まず・保存せず・学習に使わない（Clef の記事の記載）— [Cloudflare blog](https://blog.cloudflare.com/clef-decision-models)
- Codiv：リクエストの中身は集めない（メモリの中で処理）。「We do not write them to logs or to a database」、学習に使わない。推論エンジンの GPU キャッシュに一時的に残ることがある（上書きされ続ける）。使用量（アカウント・鍵・日ごとの数）は保存。委託先は Cloudflare（ホスティング。URL・IP・時刻などの運用ログ、本文は除く）・Resend・Google／GitHub のログイン・Turnstile。推論は自前のサーバーで、ほかの AI 事業者に送らない。運営の法人名はなく、連絡先は protonmail のアドレス。最終更新 2026-09-18 — [codiv.ai/privacy](https://codiv.ai/privacy)
- openjev-sglang を Modal に置く既定の設定は認証なし（`unauthenticated=True`）。`OPENJEV_API_KEY` で Bearer 認証を付けられる — [ekzhang/openjev-sglang README](https://raw.githubusercontent.com/ekzhang/openjev-sglang/HEAD/README.md)
- Verdict 2.0 の WebGPU 版は端末の中で動き「Zero data exfiltration」— [openJev-verdict-2.0 README](https://raw.githubusercontent.com/Heman10x-NGU/openJev-verdict-2.0/HEAD/README.md)
- OpenJev-Cactus（Needle）は遠隔計測があり、`NEEDLE_TELEMETRY=0` で切る — [SiliconLabAI/OpenJev-Cactus README](https://raw.githubusercontent.com/SiliconLabAI/OpenJev-Cactus/HEAD/README.md)

**ライセンス（コード・重み）**
- SemIf のコードは MIT。重みは含まず、上流のモデルはそれぞれのライセンス — [SemIf README](https://raw.githubusercontent.com/TheoLeeCJ/SemIf-OpenJev/HEAD/README.md)
- razorback16/openjev は Apache-2.0。DiffusionGemma の重みは Apache-2.0（NVIDIA／Google）、Laya と Verdict は重み・コードとも Apache-2.0（同 README の記載）— [razorback16/openjev README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)
- JevK5 は Qwen3.5-4B に、Qwen3.6-27B と GPT-6 Luna から蒸留した LoRA をマージしたもの — [razorback16/openjev README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)
- Clef と Clef-flash の重みは Apache 2.0 — [Cloudflare blog](https://blog.cloudflare.com/clef-decision-models)。Qwen3.5-4B は Apache-2.0 — [Hugging Face](https://huggingface.co/Qwen/Qwen3.5-4B)。modernbert-ja は MIT（検索結果の要約）— [Hugging Face](https://huggingface.co/sbintuitions/modernbert-ja-130m)
- GitHub の判定（2026-11-17、`gh api search/repositories`）：SemIf-OpenJev MIT、razorback16/openjev Apache-2.0、openjev-sglang **none**（ライセンスなし、アーカイブ済み）、openJev-verdict-2.0 **NOASSERTION**（README は Apache 2.0）、OpenJev-Cactus MIT、openjev.cpp MIT、OpenJevSwift Apache-2.0、zhihz/openjev **NOASSERTION**（README は Apache-2.0）— [GitHub search API](https://api.github.com/search/repositories?q=repo:razorback16/openjev)（各リポジトリを `repo:owner/name` で検索）、各 README
- Verdict 2.0 の重みは「Git LFS pointers で管理」（`artifacts/verdict2-base/model.pt`）— [openJev-verdict-2.0 README](https://raw.githubusercontent.com/Heman10x-NGU/openJev-verdict-2.0/HEAD/README.md)

**「Jev」の名前**
- SemIf は元の名前が OpenJev で改名した。「not affiliated with or endorsed by TypeSafe. Jev, TypeSafe, and other names and marks are the property of their respective owners」— [SemIf README](https://raw.githubusercontent.com/TheoLeeCJ/SemIf-OpenJev/HEAD/README.md)
- zhihz：「The project name does not imply an official open-source release of Jev」「this license does not grant rights to TypeSafe/Jev branding」— [zhihz/openjev README](https://raw.githubusercontent.com/zhihz/openjev/HEAD/README.md)
- OpenJevSwift・razorback16 も TypeSafe と無関係であることを明記 — [OpenJevSwift README](https://raw.githubusercontent.com/Algorythm-Canada/OpenJevSwift/HEAD/README.md)、[razorback16/openjev README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)
- 改名の理由（商標の争いかどうか）を書いた資料は見つからなかった。「Jev」の名前をまねたドメインが多数あるという UpGuard の記事がある（検索結果の見出しと要約のみ）— [UpGuard](https://www.upguard.com/breaches/jev-ai-domain-brand-impersonation.md)
- TypeSafe の Models のページに商標の注記はない — [TypeSafe Docs: Models](https://docs.typesafe.ai/models)

### Inferences
- 推論：送る中身は、いまと同じ `maskNames`／`maskNicknames` を通せば、名前は出ない。質問の候補には member の id・続柄・日付・食材と料理の名前しか入らないので、追加で外に出る個人の情報は増えない（むしろマスタ全体を送らない分だけ減る）。ただし本文そのもの（予定や家族の事情）は、どの選択肢でも（端末の中を除いて）外に出る。
- 推論：データの扱いの安心度は、Cloudflare（大きな事業者・明記あり）≥ TypeSafe（学習しないと明記・ZDR は enterprise のみ）＞ Codiv（記載は良いが個人運営で法人名がなく、無料の実験）。Codiv は比較の実験（合成データ）だけに使い、家族の本番の書き込みは送らないのが無難。
- 推論：ライセンスがない（openjev-sglang）か判定が食い違う（Verdict 2.0・zhihz）コードは、取り込まずに参考にとどめる。JevK5 は GPT-6 Luna からの蒸留を含むので、出力の利用規約に触れないかを確かめるまで商用で使わない方が安全（規約そのものは確かめていない）。
- 推論：きめとくの画面・案内・README の利用者向けの文では「Jev」「OpenJev」の名前を出さない（「AI の判断モデル」などと書く）。コードの中で Jev 互換の API の形（`/v1/systemone`、`jev-latest` という別名）を使うのは、互換の説明として扱える範囲と考えられるが、法的な確認はしていない。
- 推論：ホスト先を Anthropic 以外に足すと、README の「送るもの」の説明と、主催者の手順（鍵・上限・止め方）を書き足す必要がある。Workers AI なら Cloudflare のアカウントと API トークン、TypeSafe なら早期アクセスのアカウントが要る。

### Gaps
- TypeSafe の Legal のページ（DPA・プライバシーポリシー・ZDR の条件）の本文、データの保存期間・保存場所は取得していない。
- Cloudflare Workers AI 全体の規約（Clef の記事以外）での保存・ログの扱いは取得していない。
- 「Jev」が登録商標かどうか（日本・米国）は調べていない。
- 日本の個人情報保護法の越境移転の観点（本文を米国の事業者に送ること）は、この調査の範囲外。
- JevK5 自体のライセンスと、GPT-6 Luna の出力の利用規約は確かめていない。cactus-needle のライセンスも未確認。

---

## 6. 成熟度のリスク：どれが手入れされているか、何が壊れうるか（＋総合の推奨と実験計画）

### Takeaway
OpenJev 系のリポジトリはどれも 2026-09-16〜09-29 に作られた1〜2か月ものの若いプロジェクトで、10月下旬以降に push があるものはない。継続して整っているのは razorback16/openjev（Apache-2.0、Docker 版 0.7.0、Codiv で実運用）と、その Swift 移植の OpenJevSwift（0.1.0、CI つき）くらいで、SemIf は注目度は最大だが push は 9-23 が最後、openjev-sglang はアーカイブ済み（SGLang 本体の decisions に移行）、Cactus・openjev.cpp は事実上1日で止まっている。きめとくが頼るなら、クローンのコードではなく「事業者がホストする API（Cloudflare・TypeSafe）」か、上流（vLLM・SGLang）に取り込まれた機能に寄せるのが安全。

### Cited Findings
**リポジトリの状態（2026-11-17、GitHub search API）**

| リポジトリ | 作成 | 最後の push | ★ | fork | open issues | ライセンス（GitHub） | 状態・中身 |
|---|---|---|---|---|---|---|---|
| TheoLeeCJ/SemIf-OpenJev | 2026-09-16 | 2026-09-23 | 4,963 | 356 | 47 | MIT | 旧名 OpenJev。Qwen3.5-4B の確率を直接読む。CUDA・MLX・MPS・llama.cpp（CPU）・WebGPU |
| razorback16/openjev | 2026-09-18 | 2026-10-13 | 792 | 72 | 3 | Apache-2.0 | DiffusionGemma＋Laya・Verdict・CLM・JevK5・Clef を同じ API で。Codiv で無料ホスト |
| ekzhang/openjev-sglang | 2026-09-17 | 2026-10-01 | 334 | 45 | 5 | none | **アーカイブ済み**。SGLang の native decisions endpoint を使うよう案内 |
| Heman10x-NGU/openJev-verdict-2.0 | 2026-09-19 | 2026-10-21 | 306 | 50 | 5 | NOASSERTION | 151M の非自己回帰の判断モデル（英語） |
| SiliconLabAI/OpenJev-Cactus | 2026-09-24 | 2026-09-24 | 7 | 4 | 0 | MIT | Needle のツール呼び出しの FastAPI |
| cappuch/openjev.cpp | 2026-09-21 | 2026-09-24 | 4 | 1 | 0 | MIT | llama.cpp の fork（OpenJev NLI cross-encoder 用） |
| Algorythm-Canada/OpenJevSwift | 2026-09-29 | 2026-10-10 | 10 | 2 | 0 | Apache-2.0 | OpenJev の Swift 実装。0.1.0、CI・ドキュメント |
| zhihz/openjev | 2026-09-16 | 2026-09-16 | 37 | 4 | 1 | NOASSERTION | 研究プレビュー（英・中）、Qwen3-4B-Instruct-2507 |

  出典：[GitHub search API](https://api.github.com/search/repositories?q=repo:TheoLeeCJ/SemIf-OpenJev)（8件とも `repo:owner/name` で同じく検索）。★の数は push と関係なく増える（updated_at は 11-09〜11-17）。

- openjev-sglang：「SGLang is now shipping with a native decisions endpoint implemented in the same way - please use the new API instead」— [ekzhang/openjev-sglang README](https://raw.githubusercontent.com/ekzhang/openjev-sglang/HEAD/README.md)
- OpenJev の DiffusionGemma の読み取りは vLLM の PR #57250（2026-09-22 にマージ）に依存。イメージは vLLM の特定のコミットを固定し、2つの変更（候補の id の上限 128→512、画像の注意のパッチ）を当てる。「A build fails if either change no longer applies」。CLM と JevK5 のイメージは古い vLLM のコミットのまま — [razorback16/openjev README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)
- openjev-sglang は SGLang の「mixed-logprob batch crash」を避けるための回避策を入れている — [ekzhang/openjev-sglang README](https://raw.githubusercontent.com/ekzhang/openjev-sglang/HEAD/README.md)
- CLM の score の質問は文脈を無視することがある（上流の issue #3）— [razorback16/openjev README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)
- Jev 本体も版が動く：`jev-latest` は 2026-10-14 から `jev-1.14.0`（Box 型を追加）。OpenJev は `jev-1.13.0` のような固定の版の名前には 400 を返す — [TypeSafe Docs: Models](https://docs.typesafe.ai/models)、[razorback16/openjev README](https://raw.githubusercontent.com/razorback16/openjev/HEAD/README.md)
- Jev 自体が早期アクセス（2026-09-15 公開）— [TypeSafe blog](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- Codiv の無料は「Free public experiment」「while the experiment runs」— [codiv.ai](https://codiv.ai)
- zhihz は「Research preview」で、Jev などとの性能比較はしていないと明記 — [zhihz/openjev README](https://raw.githubusercontent.com/zhihz/openjev/HEAD/README.md)
- Cloudflare の Clef は 2026-10-01 に Workers AI で公開（大手の事業者がホスト）— [Cloudflare blog](https://blog.cloudflare.com/clef-decision-models)

### Inferences
- 推論（壊れうるもの）：
  1. 無料の実験（Codiv）が終わる・値段がつく・止まる。
  2. 別名（`jev-latest`）の指す版が変わり、確率の分布が動いて、決めたしきい値が合わなくなる → 版を固定（`jev-1.14.0` など）し、版を上げるたびに較正し直す。
  3. 自前で動かす場合、vLLM・SGLang の更新でパッチが当たらなくなり、ビルドが壊れる（README 自身がそう書く）。
  4. 1〜2か月で止まったリポジトリ（Cactus・openjev.cpp・zhihz・SemIf の本体）に依存すると、修正が来ない。
  5. 量子化・実行経路の違いで確率がずれる（2章）。
  6. API の形のずれ（Jev の新しい型、エラーの形の違い）。
- 推論：きめとくはすでに「AI が失敗したらルールで読む」作りなので、判断エンジンが止まっても家族の操作は止まらない。壊れたときの被害は「AI で読めない書き込みが増える」に限られ、成熟度のリスクは受け入れやすい。

#### 総合の推奨（推論）
- **置き換えではなく、重ねる**：「ルール → 判断エンジン（すべての項目がしきい値以上で validateCommands を通ったときだけ採用）→ Claude（Haiku 5.5）→ ルール」。判断エンジンが引き受けるのは1用件の書き込みと、真偽の印・「出さない」条件の判定。複数の用件・低い確率は Claude と、既存の聞き返し（日付・人・候補）に回す。
- **まずはホスト型**：第一候補は Cloudflare Workers AI の Clef-flash（安い・速い・無料枠が家族アプリの量に足りる・データを保存しないと明記・重みが Apache-2.0 なので後で自前に移せる）、精度の比較に Clef。TypeSafe Jev 1.14 は本家の基準として比べる（安いが早期アクセス・日本語の記載なし）。Codiv は合成データでの比較だけ。
- **自前の GPU・端末の中・Netlify の CPU は今は採らない**：家族アプリの量では自前 GPU は待機の課金と起動の待ちで不利、4B 級は Netlify の 1024 MB に入らない、端末の中は日本語の小さいモデルがない。
- **名前**：利用者向けの文に「Jev」「OpenJev」を出さない。

#### 推奨する実験の計画（推論）
1. **評価セットを作る（1〜2日）**：実際の家族の記録は使わず、合成の書き込み300〜500件に正解の commands を付ける。きめとくのテストの文例（[src/engine/parser.test.ts](/home/user/kondate/prototype/src/engine/parser.test.ts)、[src/engine/__fixtures__/](/home/user/kondate/prototype/src/engine/__fixtures__/)）を元に、ルールで unknown になる文（省略・方言・打ち消し・仮定・「かも」・塾／残業・複数の用件・時期だけ）を多めにする。較正用と評価用に分ける。
2. **オフラインの比較（合成データだけ、2〜3日）**：
   - 質問の設計 A（指示と候補を日本語）と B（英語の指示＋日本語の本文）。種類は「11個の yes/no」と「12択」の両方。
   - 食材・料理はルールの別名照合で上位16件以内＋「該当なし」に絞る。
   - モデル：Clef-flash・Clef（Workers AI）、Jev 1.14（版を固定）、参考に Codiv の openjev-latest・jevk5。基準として Claude Haiku 5.5・Opus 5.5（いまの経路）。
   - 指標：項目ごとの正解率、validateCommands 後の命令の完全一致、温度で較正したあとの Brier・ECE、カバー率と正解率の曲線、p50／p95 の遅延（Netlify の関数と同じ US East から）、1,000回あたりの費用。
   - 合格の目安（例）：状態を変える命令（absence・today_impossible・want_alternatives・out_of_stock・have）で、自動で実行する分の正解率が Haiku 5.5 以上、かつカバー率70%以上、p95 2秒以内。届かなければ判断エンジンは「出さない」条件と印の判定だけに使う（Claude の結果の検証役）か、見送る。
3. **影のモード（1〜2週間）**：Netlify の関数で、AI に回る書き込みについて判断エンジンを並行に呼び、構造化した結果と確率だけを比べる（本文は保存しない。家族への返事はいまの経路のまま）。家族への説明（送り先が増えること）を README と画面に足してから行う。
4. **切り替え**：しきい値以上は判断エンジンの結果を使い、低いものは聞き返しか Claude。費用の上限（Workers AI の無料枠・Anthropic の月の上限）と、止め方（鍵を消す）を主催者の手順に書く。
5. **（任意）日本語の小さい判断モデル**：ホスト型で日本語の精度が足りても、さらに費用・遅延を下げたい、または端末の中で読みたいときだけ、modernbert-ja-130m＋GLiClass 風の頭を合成データで学習する案を検討する。

- この推奨を変える条件：判断エンジンが日本語で Haiku に明らかに負ける（→ Claude Haiku＋マスタの絞り込みで費用を下げる方が早い）／家族の書き込みの大半が複数の用件（→ 判断エンジンの出番が少ない）／Cloudflare・TypeSafe の規約が家族の書き込みを送るのに合わない。

### Gaps
- 各リポジトリの issue・PR の中身（バグの多さ、返事の速さ）は、指定の制約（search API だけ）のため見ていない。
- SGLang の decisions endpoint のドキュメント（ekzhang の README のリンク先）は取得していない。
- Cloudflare・TypeSafe の判断 API の稼働率・SLA は調べていない。
- 1日に何回 AI に回るか（費用の見積もりの前提）は推測で、実測がない。

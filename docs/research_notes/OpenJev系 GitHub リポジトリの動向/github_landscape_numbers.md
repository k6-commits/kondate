# OpenJev系 GitHub リポジトリの定量的ランドスケープ（2026-11-17 時点スナップショット）

## 1. 各クエリのヒット数と、重複除去後のプロジェクト数（誤検出チェックを含む）

### Takeaway
「OpenJev」の名前を含むリポジトリは少ない。`openjev in:name` は 103 件、README まで含めても 1,056 件にとどまる。一方、名前に `jev` を含むリポジトリは 2026-09-01 以降だけで 11,922 件あり、大半は Jev API を使うアプリやツールである。13 本の狭義クエリを重複除去すると 648 件（誤検出 51 件を除くと 597 件）、全約 60 クエリの和集合では 5,215 件になった。分類後、オープンな再現・近似・移植にあたる「コア OpenJev 系」は約 1,200 件と推定され、★10 以上は 224 件、★100 以上は 79 件だった。

### Cited Findings

#### 方法と定義（以下の全節に共通）
- データ源は `gh api -X GET search/{repositories,issues,commits,code}` のみで、取得時刻は 2026-11-17 12:57–13:17 UTC。search API は 1 クエリあたり最大 1,000 件しか返さず、fork を既定で除外する。母数が 1,000 を超えるクエリは `total_count` だけを使い、品目単位の集計には★順の上位 1,000 件を使った。生データ（raw JSON・log.jsonl・union_classified.json）とスクリプトは scratchpad の /tmp/claude-0/-home-user-kondate/04605fb6-640d-5eba-9853-aad3829a33ef/scratchpad/gh/ と /tmp/claude-0/-home-user-kondate/04605fb6-640d-5eba-9853-aad3829a33ef/scratchpad/scripts/ に置いた（永続保存ではない）。— [GitHub Search API](https://api.github.com/search/repositories?q=openjev%20in%3Aname%2Cdescription%2Creadme)
- 区分コードは次のとおり。
  - コア OpenJev 系
    - M：オープン決定モデル（学習・再現）
    - S：Jev 互換サーバー、または既存 LLM による近似アダプタ
    - P：ポート/ランタイム（MLX、Core ML、ONNX、llama.cpp、vLLM など）
    - MM：マルチモーダル決定モデル
    - D：ドメイン・言語特化
  - 周辺ツール
    - PL：プラグイン、統合、SDK、CLI
    - APP：Jev API またはオープン決定モデルを使うアプリ・デモ
    - B：ベンチマーク・評価
    - L：awesome リスト、チュートリアル
  - その他
    - ADJ：既存プロジェクトが言及または対応しているだけのもの
    - UNK：README でのみ言及され、未分類のもの
    - FP：無関係（誤検出）
- 分類方法：271 件（うちコア 142 件）は説明文をもとに手作業で分類した（判断が難しい約 16 件は README 冒頭も確認した）。残りは name・description・topics に正規表現ルールを当てて分類したため、ロングテールの件数は概数である。README は分類目的でしか読んでいない。— [例: NandhaKishorM/laya README](https://raw.githubusercontent.com/NandhaKishorM/laya/HEAD/README.md)

#### クエリ別ヒット数（`total_count`、取得時刻は UTC）
| クエリ | 件数 | 取得 | リンク |
|---|---:|---|---|
| `openjev in:name,description,readme` | 1,056 | 12:57 | [API](https://api.github.com/search/repositories?q=openjev%20in%3Aname%2Cdescription%2Creadme) |
| `openjev in:name` | 103 | 12:57 | [API](https://api.github.com/search/repositories?q=openjev%20in%3Aname) |
| `openjev in:description` | 77 | 12:57 | [API](https://api.github.com/search/repositories?q=openjev%20in%3Adescription) |
| `openjev in:readme` | 1,038 | 12:57 | [API](https://api.github.com/search/repositories?q=openjev%20in%3Areadme) |
| `openjev in:name,description` | 155 | 12:57 | [API](https://api.github.com/search/repositories?q=openjev%20in%3Aname%2Cdescription) |
| `openjev in:name,description,readme created:<2026-09-01` | 108 | 12:59 | [API](https://api.github.com/search/repositories?q=openjev%20in%3Aname%2Cdescription%2Creadme%20created%3A%3C2026-09-01) |
| `openjev in:name,description,readme created:>=2026-09-01` | 948 | 12:59 | [API](https://api.github.com/search/repositories?q=openjev%20in%3Aname%2Cdescription%2Creadme%20created%3A%3E%3D2026-09-01) |
| `"jev-compatible"` | 152 | 12:58 | [API](https://api.github.com/search/repositories?q=%22jev-compatible%22) |
| `"Jev-compatible"`（大文字小文字は区別されず同数） | 152 | 12:58 | [API](https://api.github.com/search/repositories?q=%22Jev-compatible%22) |
| `"jev-compatible" in:name,description,readme` | 821 | 13:07 | [API](https://api.github.com/search/repositories?q=%22jev-compatible%22%20in%3Aname%2Cdescription%2Creadme) |
| `"jev-like"` | 143 | 13:06 | [API](https://api.github.com/search/repositories?q=%22jev-like%22) |
| `"jev-style"` | 234 | 13:06 | [API](https://api.github.com/search/repositories?q=%22jev-style%22) |
| `"jev alternative"` / `"alternative to jev"` | 17 / 16 | 13:06 | [API](https://api.github.com/search/repositories?q=%22jev%20alternative%22) |
| `"open-source jev"` | 39 | 13:07 | [API](https://api.github.com/search/repositories?q=%22open-source%20jev%22) |
| `topic:openjev` | 22 | 12:59 | [API](https://api.github.com/search/repositories?q=topic%3Aopenjev) |
| `topic:jev`（うち 2026-09-01 以降作成は 2,901） | 3,025 | 12:59 | [API](https://api.github.com/search/repositories?q=topic%3Ajev) |
| `jev in:name` | 15,227 | 12:58 | [API](https://api.github.com/search/repositories?q=jev%20in%3Aname) |
| `jev in:name created:>=2026-09-01` | 11,922 | 12:58 | [API](https://api.github.com/search/repositories?q=jev%20in%3Aname%20created%3A%3E%3D2026-09-01) |
| `jev in:name created:<2026-09-01` | 3,305 | 12:59 | [API](https://api.github.com/search/repositories?q=jev%20in%3Aname%20created%3A%3C2026-09-01) |
| `jev in:name,description created:>=2026-09-01` | 16,281 | 12:58 | [API](https://api.github.com/search/repositories?q=jev%20in%3Aname%2Cdescription%20created%3A%3E%3D2026-09-01) |
| `jev created:>=2026-09-01`（既定の検索対象：name/description/topics） | 16,704 | 12:59 | [API](https://api.github.com/search/repositories?q=jev%20created%3A%3E%3D2026-09-01) |
| `jev in:readme created:>=2026-09-01` | 34,754 | 12:59 | [API](https://api.github.com/search/repositories?q=jev%20in%3Areadme%20created%3A%3E%3D2026-09-01) |
| `jev in:name,description,readme created:>=2026-09-01 stars:>=100` | 324 | 13:11 | [API](https://api.github.com/search/repositories?q=jev%20in%3Aname%2Cdescription%2Creadme%20created%3A%3E%3D2026-09-01%20stars%3A%3E%3D100) |
| `typesafe jev` | 4,233 | 12:59 | [API](https://api.github.com/search/repositories?q=typesafe%20jev) |
| `"System One" decision` | 811 | 12:58 | [API](https://api.github.com/search/repositories?q=%22System%20One%22%20decision) |
| `"semantic if"` | 11 | 12:58 | [API](https://api.github.com/search/repositories?q=%22semantic%20if%22) |
| `semif`（2026-09-01 以降作成は 260） | 1,695 | 12:58 | [API](https://api.github.com/search/repositories?q=semif) |
| `"typed decisions"` | 881 | 12:59 | [API](https://api.github.com/search/repositories?q=%22typed%20decisions%22) |
| `"typed decision" created:>=2026-09-01` | 865 | 13:07 | [API](https://api.github.com/search/repositories?q=%22typed%20decision%22%20created%3A%3E%3D2026-09-01) |
| `"v1/systemone" in:name,description,readme` | 7,383 | 13:06 | [API](https://api.github.com/search/repositories?q=%22v1%2Fsystemone%22%20in%3Aname%2Cdescription%2Creadme) |
| `"decision model" created:>=2026-09-01` | 2,816 | 13:07 | [API](https://api.github.com/search/repositories?q=%22decision%20model%22%20created%3A%3E%3D2026-09-01) |
| `laya decision` | 872 | 13:07 | [API](https://api.github.com/search/repositories?q=laya%20decision) |
| `topic:system-one` / `topic:decision-model` | 584 / 577 | 13:07–13:08 | [API](https://api.github.com/search/repositories?q=topic%3Asystem-one) |

#### 重複除去後の件数（筆者集計）
| 集合 | 構成 | 重複除去後 | 内訳 |
|---|---|---:|---|
| 狭義プール（name/desc/topic レベル） | `openjev` in:name/desc、`"jev-compatible"`、`"jev-like"`、`"jev-style"`、alternative 系 2 本、`"open-source jev"`、`topic:openjev`、`semif`（09-01 以降）、`"semantic if"` の 13 クエリ（`total_count` の単純合計は 1,381） | 648 | FP 51、コア 485、周辺ツール 107、ADJ 5 |
| 狭義プール＋README レベル | 上記に `openjev in:name,description,readme`（作成日 09-01 前後に分けて取得し、1,056 件すべてを取得）と `"jev-compatible" in:name,description,readme`（上位 100 件）を加えたもの | 1,550 | FP 51、ADJ 129、UNK 300、コア 586、周辺ツール 484 |
| 全和集合 | 約 60 クエリの全取得ページ（広いクエリは上位 1,000 件まで） | 5,215 | Jev 関連（コア＋周辺ツール）3,808、コア 1,197（うち★10 以上 224、★100 以上 79、★1,000 以上 17） |
| `openjev` を名前に含むもの | `openjev in:name`（取得したのは上位 100 件） | 103 | 合計★7,018、★10 以上は 15 件のみ |

出典：上表の各クエリ（[狭義の例](https://api.github.com/search/repositories?q=%22jev-like%22)、[README の例](https://api.github.com/search/repositories?q=openjev%20in%3Areadme)）を筆者が集計した。

#### 誤検出チェック
- `jev in:name created:<2026-09-01`（3,305 件）は、ほぼすべて無関係だった。上位 100 件のうち 32 件が JeVois・JEvents・Jevil・jevinskie などの既存名で、説明文に Jev/TypeSafe/decision を含むのは feder-cr/jev、parable-work/jev-datafusion、carlaiau/jev-reranking、miniLV/Jev-Auto-Router の 4 件だけだった。feder-cr/jev は 2024-08-15 作成のリポジトリで、現在は「jevos: an open-source alternative to Jev」に転用されている。— [API](https://api.github.com/search/repositories?q=jev%20in%3Aname%20created%3A%3C2026-09-01)
- `semif` は上位 100 件中 74 件が semifinal・SemiFL・Semiformer などの誤検出だった。狭義プールの FP 51 件の大半はこれにあたる。— [API](https://api.github.com/search/repositories?q=semif)
- `"System One" decision` は上位 100 件中 94 件が Jev/TypeSafe/decision model に言及しており、誤検出は少ない。— [API](https://api.github.com/search/repositories?q=%22System%20One%22%20decision)
- Eclipse OpenJ9 は `openjev` 系クエリの結果に 1 件も混入しなかった（name/description に "openj9" を含むものは 0 件）。— [API](https://api.github.com/search/repositories?q=openjev%20in%3Aname%2Cdescription%2Creadme)
- `laya in:name created:>=2026-09-01` は 2,640 件。上位 100 件のうち 61 件が決定モデル関連で、LayaAir（ゲームエンジン）系は 1 件だった。— [API](https://api.github.com/search/repositories?q=laya%20in%3Aname%20created%3A%3E%3D2026-09-01)
- Jev の yes/no 型名 `noul` は 13,148 件ヒットしたが、ルーマニア語の "noul"（＝the new）が混ざるため結論には使わなかった。— [API](https://api.github.com/search/repositories?q=noul%20in%3Aname%2Cdescription%2Creadme)
- 公式 org の typesafe-ai/system-one-adapter-python（★410、2026-08-08 作成、「Drop-in TypeSafeClient replacement backed by LLM APIs」）と typesafe-ai/typesafe-sdk-js（★287）は TypeSafe 自身のものなので、第三者クローンの上位表からは除いた。— [README](https://raw.githubusercontent.com/typesafe-ai/system-one-adapter-python/HEAD/README.md)

### Inferences
- 定量的には 3 層に分けて見るのが妥当である。(a) 「OpenJev」を名乗るもの（約 100 件）、(b) オープンな代替を作るコア層（約 1,200 件、★10 以上は約 220 件）、(c) Jev を使うエコシステム全体（名前に jev を含むものが約 1.2 万件）。報告書で「OpenJev 系」というときは (b) を指し、(a) はブランド名として限定的にしか使われていない、と整理できる。
- `"v1/systemone"`（API パス）を README に書くリポジトリが 7,383 件ある。名称より「Jev 互換 API の型」のほうが広く共有されている。

### Gaps
- 全和集合のロングテール（★0〜9）はルール分類のため、カテゴリ件数には数%〜十数%の誤差がありうる。特に B（ベンチマーク）は "evaluate" などの語で過大になっている可能性がある。
- 上限 1,000 件の制約のため、`jev in:name`（11,922 件）の★0 の大半は品目単位で取得していない。この層は件数（`total_count`）でしか扱っていない。
- fork は検索から除外されるので、Laya の 3,199 fork などの派生は件数に入っていない。

## 2. 作成タイムライン（2026-09-01 以降の日次・週次）

### Takeaway
作成は Jev のローンチ翌日の 2026-09-16 に始まり、9/21〜9/27 の週がピークだった（名前に jev を含むもの：1 日最大 1,128 件、9/21）。その後は週ごとに 3〜4 割ずつ減り、11 月中旬は約 31 件/日（ピーク比約 3%）。コア OpenJev 系の新規作成は 9 月 825 件、10 月 310 件、11 月（1〜17 日）54 件と細っているが、ゼロにはなっていない。

### Cited Findings
- Jev（TypeSafe AI の System One モデル）は 2026-09-15 にローンチされたと報じられている。資料公開は 9/14 とする記述もある。この 2 点はいずれも検索結果の要約からの二次情報で、本文は未確認。— [letsdatascience](https://letsdatascience.com/news/typesafe-ai-launches-jev-decision-model-889a38c0); [InfoQ](https://www.infoq.com/news/2026/10/typesafe-ai-jev-released)
- 最初期の代替実装は 2026-09-16 に作成された。TheoLeeCJ/SemIf-OpenJev（03:51Z 作成、旧名 openjev）、vinnylarouge/jevlike、zhihz/openjev、Mapika/decider、kikoncuo/jevfire がこれにあたる。2026-09-18 付の記事は、初期の代替として TheoLeeCJ/openjev、r-ms/mini-jev、vinnylarouge/jevlike（当時★764）を挙げている。— [API](https://api.github.com/search/repositories?q=openjev%20in%3Aname); [Apidog 2026-09-18](https://apidog.com/blog/openjev-open-source-jev-alternatives/)

#### `jev in:name` の日次作成数（`created:YYYY-MM-DD` ごとの `total_count`。完全な件数、13:03–13:06Z 取得）
| 週（月曜始まり） | 作成数 | 主な日次値 |
|---|---:|---|
| 09-01〜09-13 | 44 | ローンチ前 |
| 09-14〜09-20 | 2,892 | 9/14: 4、9/15: 4、9/16: 63、9/17: 373、9/18: 628、9/19: 861、9/20: 959 |
| 09-21〜09-27 | 4,484 | 9/21: 1,128（ピーク）、9/22: 904、9/23: 753、9/24: 536 |
| 09-28〜10-04 | 1,673 | 9/28: 335 → 10/4: 163 |
| 10-05〜10-11 | 915 | 約 130/日 |
| 10-12〜10-18 | 629 | 約 90/日 |
| 10-19〜10-25 | 435 | 約 62/日 |
| 10-26〜11-01 | 351 | 約 50/日 |
| 11-02〜11-08 | 241 | 約 34/日 |
| 11-09〜11-15 | 208 | 約 30/日 |
| 11-16〜11-17（2 日間、17 日は途中まで） | 50 | 11/16: 38、11/17: 12 |

月別では 9 月 8,323 件、10 月 3,065 件、11 月 1〜17 日 534 件（計 11,922 件）。11/10〜11/16 の平均は 31.4 件/日で、ピーク日の約 2.8% にあたる。— [API（日次の例）](https://api.github.com/search/repositories?q=jev%20in%3Aname%20created%3A2026-09-21)

#### 狭い集合の週次作成数（品目の `created_at` から筆者集計）
| 週（月曜始まり） | `openjev`（全文、09-01 以降 948 件） | 狭義プール（FP 除く 597 件） | コア OpenJev 系（1,197 件） |
|---|---:|---:|---:|
| 09-14 より前 | 15 | 16 | 13 |
| 09-14〜 | 213 | 127 | 228 |
| 09-21〜 | 297 | 220 | 502 |
| 09-28〜 | 142 | 94 | 177 |
| 10-05〜 | 83 | 47 | 93 |
| 10-12〜 | 56 | 26 | 65 |
| 10-19〜 | 35 | 25 | 42 |
| 10-26〜 | 31 | 15 | 24 |
| 11-02〜 | 36 | 17 | 24 |
| 11-09〜 | 32 | 8 | 23 |
| 11-16〜11-17 | 8 | 2 | 6 |

出典：[`openjev`（09-01 以降）](https://api.github.com/search/repositories?q=openjev%20in%3Aname%2Cdescription%2Creadme%20created%3A%3E%3D2026-09-01)、狭義プールの各クエリ、全和集合を分類したもの。
- 日次のピークは、`openjev` 全文が 9/20 の 66 件、コア OpenJev 系が 9/22 の 125 件（9/21: 98、9/23: 93）だった。月別に見ると、コアは 9 月 825、10 月 310、11 月 54 件。`openjev` 全文は 9 月 598、10 月 271、11 月 79 件。— [API](https://api.github.com/search/repositories?q=openjev%20in%3Aname%2Cdescription%2Creadme%20created%3A%3E%3D2026-09-01)
- コアのカテゴリ別の月推移（9 月/10 月/11 月）は次のとおり：M 382/155/27、S 197/75/10、P 168/40/10、MM 56/23/6、D 22/17/1。ポートと API サーバーの新規作成は M より早く減り、10 月以降はモデル（M）と多モーダル（MM）が相対的に多い。— [API（`"decision model"`）](https://api.github.com/search/repositories?q=%22decision%20model%22%20created%3A%3E%3D2026-09-01)
- 上位 30 件のコア（第 3 節）は 27 件が 9 月作成で、10 月作成は 2 件（Phocinae-Largha-150M-v1、StartLux-Prism）だけだった。

### Inferences
- 量的なブームはローンチから 2 週間でほぼ終わり、ロングテールでの作成が続いている状態である。11 月も 1 日あたり 30 件前後の jev 系リポジトリと 3〜4 件のコア系リポジトリが新たに作られているので、「消滅」ではなく「定常化」と表現するのが正確である。
- 10 月以降の新規の中身は、ローンチ直後に多かった近似アダプタやポートより、学習済みモデル（M/MM）寄りに移っている。

### Gaps
- `created_at` は作成時点を示すだけで、名前変更や転用（例：feder-cr/jev は 2024 年作成）は反映されない。09-14 より前に作成されたものは、既存リポジトリが後から言及を加えたケースが中心である。
- コアの週次値は全和集合からの集計なので、広いクエリで上位 1,000 件に入らなかった★0 のコアは数に入っていない。

## 3. スター分布：上位 30 リポジトリと集中度

### Takeaway
スターは極端に集中している。コア OpenJev 系 1,197 件の合計★109,578 のうち、NandhaKishorM/laya 1 件が 32.5%、上位 5 件が 55.6%、上位 10 件が 66.0%、上位 30 件が 84.4% を占める。中央値は★1 で、45% にあたる 540 件は★0 だった。上位 30 件は M 13・S 9・P 6・MM 2 で、Laya 本体と派生ポート、Kev、SemIf-OpenJev が中心にある。

### Cited Findings

#### コア OpenJev 系 上位 30（★順、TypeSafe 公式 org は除外、12:57–13:12Z 取得）
| # | リポジトリ | ★ | fork | open issues | 作成 | 最終 push | 言語 | ライセンス | 区分 | 一行説明 |
|---:|---|---:|---:|---:|---|---|---|---|---|---|
| 1 | [NandhaKishorM/laya](https://github.com/NandhaKishorM/laya) | 35,630 | 3,199 | 99 | 09-18 | 11-16 | Python | Apache-2.0 | M | 非自己回帰の System 1 決定エンジン「Laya」。choice/score/yes-no、100 以上の言語に対応 |
| 2 | [jaredpalmer/kev](https://github.com/jaredpalmer/kev) | 10,033 | 688 | 71 | 09-17 | 11-15 | Python | Apache-2.0 | M | Qwen3.5/3.8 ベースの Jev 風決定モデル群（0.8B〜27B）。TypeSafe SDK がそのまま動くと README に記載 |
| 3 | [mizorewww/laya-mlx](https://github.com/mizorewww/laya-mlx) | 7,108 | 577 | 0 | 09-19 | 11-17 | Python | Apache-2.0 | P | Laya の MLX ネイティブ実行（M3 Max で 7–14ms） |
| 4 | [TheoLeeCJ/SemIf-OpenJev](https://github.com/TheoLeeCJ/SemIf-OpenJev) | 4,963 | 356 | 47 | 09-16 | 09-23 | Python | MIT | S | オープンモデルのロジットで「semantic if」を実現（3090 1 枚）。最初期の OpenJev で、TypeSafe とは非提携 |
| 5 | [Contrastive-LM/CLM](https://github.com/Contrastive-LM/CLM) | 3,208 | 276 | 33 | 09-23 | 10-05 | Python | Apache-2.0 | M | 対照学習で訓練した System One モデル |
| 6 | [deepopen-com/deepopen](https://github.com/deepopen-com/deepopen) | 3,075 | 342 | 17 | 09-21 | 11-03 | Python | Apache-2.0 | M | 多言語・非自己回帰の System 1 決定エンジン（中国発） |
| 7 | [TianyuCodings/NanoJev](https://github.com/TianyuCodings/NanoJev) | 2,600 | 262 | 9 | 09-17 | 10-16 | Python | MIT | M | 0.6B の Jev ナノ複製と学習パイプライン |
| 8 | [bespokelabsai/nimble](https://github.com/bespokelabsai/nimble) | 2,311 | 174 | 9 | 09-18 | 11-14 | Python | none | M | 「Data, Model, Recipe for an open Jev」（Bespoke-Nimble-9B） |
| 9 | [StartLuxLabs/StartLux-Decision](https://github.com/StartLuxLabs/StartLux-Decision) | 1,765 | 168 | 18 | 09-29 | 10-23 | Python | Apache-2.0 | M | 0.8B〜27B のオープン決定モデル |
| 10 | [mizorewww/laya-coreml](https://github.com/mizorewww/laya-coreml) | 1,640 | 140 | 0 | 09-19 | 11-17 | Python | Apache-2.0 | P | Laya の Core ML / Neural Engine への移植（約 5ms） |
| 11 | [nokia-applied-research/AnyJev](https://github.com/nokia-applied-research/AnyJev) | 1,619 | 180 | 12 | 09-21 | 10-21 | Python | Apache-2.0 | S | 任意の LLM を学習なしで Jev 風の決定モデルにする |
| 12 | [firelex/jeff](https://github.com/firelex/jeff) | 1,603 | 83 | 0 | 09-28 | 11-06 | Python | MIT | M | 0.8B のオープン「System 1」モデル |
| 13 | [ollaya-dev/ollaya](https://github.com/ollaya-dev/ollaya) | 1,469 | 92 | 15 | 09-23 | 11-10 | Rust | Apache-2.0 | S | 決定モデル版の Ollama。Jev 互換 API サーバーで 29 モデル系統に対応 |
| 14 | [vinnylarouge/jevlike](https://github.com/vinnylarouge/jevlike) | 1,371 | 122 | 8 | 09-16 | 09-16 | Python | MIT | M | 選択肢から選ぶ小型モデルの学習（作成日以降 push なし） |
| 15 | [strands-labs/strands-decider](https://github.com/strands-labs/strands-decider) | 1,212 | 132 | 63 | 09-29 | 11-17 | Python | Apache-2.0 | M | エージェント向けの小型・高速な決定モデル |
| 16 | [receptron/laya](https://github.com/receptron/laya) | 1,081 | 90 | 5 | 09-19 | 10-17 | TypeScript | MIT | P | Laya を Node.js/TS から ONNX Runtime 経由で実行 |
| 17 | [Mapika/decider](https://github.com/Mapika/decider) | 1,055 | 55 | 2 | 09-16 | 10-20 | Python | Apache-2.0 | M | Qwen3.5 を微調整した System One 風モデル群 |
| 18 | [TypeLLM/TypeLLM](https://github.com/TypeLLM/TypeLLM) | 982 | 66 | 1 | 09-17 | 10-25 | Python | Apache-2.0 | S | LLM の型安全生成フレームワーク（JevBench の結果を掲載、ホステッド API あり） |
| 19 | [feder-cr/jev](https://github.com/feder-cr/jev) | 971 | 149 | 5 | 2024-08-15 | 10-18 | C++ | MIT | S | jevos。Jev / Microsoft-Decision-1 の OSS 代替（既存リポジトリの転用） |
| 20 | [Rizzo-AI-Academy/rizzo-flow](https://github.com/Rizzo-AI-Academy/rizzo-flow) | 965 | 65 | 24 | 09-21 | 09-25 | Python | Apache-2.0 | S | トークンを生成せずに LLM から型付き決定を得るローカル版 Jev |
| 21 | [mode-io/vllm-jev](https://github.com/mode-io/vllm-jev) | 954 | 27 | 3 | 09-24 | 10-22 | Python | Apache-2.0 | P | Jev 系決定モデルを vLLM でネイティブ配信 |
| 22 | [wfzyx/von](https://github.com/wfzyx/von) | 922 | 75 | 0 | 09-18 | 10-19 | Python | Apache-2.0 | M | OSS の System One 決定モデル（15ms 未満、ドロップイン代替） |
| 23 | [Valen-Team/Valen](https://github.com/Valen-Team/Valen) | 922 | 88 | 1 | 09-23 | 11-15 | Python | Apache-2.0 | MM | テキスト・画像・動画のオープン多モーダル決定モデル（0.8B〜27B） |
| 24 | [githubnext/localjev](https://github.com/githubnext/localjev) | 843 | 55 | 3 | 09-18 | 09-18 | TypeScript | MIT | S | Bun 製のローカル Jev 互換 `/v1/systemone`（DiffusionGemma を利用） |
| 25 | [InternLM/Intern-Decision](https://github.com/InternLM/Intern-Decision) | 809 | 30 | 5 | 09-24 | 11-16 | Python | Apache-2.0 | MM | 高速なマルチモーダル決定モデル |
| 26 | [razorback16/openjev](https://github.com/razorback16/openjev) | 792 | 72 | 3 | 09-18 | 10-13 | Python | Apache-2.0 | S | DiffusionGemma 上の Jev 互換決定サーバー（"OpenJev"） |
| 27 | [Phocinae/Phocinae-Largha-150M-v1](https://github.com/Phocinae/Phocinae-Largha-150M-v1) | 761 | 1 | 0 | 10-08 | 10-20 | Python | Apache-2.0 | M | 144.3M パラメータの中英バイリンガル決定モデル |
| 28 | [featherless-ai/simple-jev](https://github.com/featherless-ai/simple-jev) | 659 | 76 | 2 | 09-18 | 11-11 | Python | Apache-2.0 | S | 任意のオープンモデルを分類器・Jev エンドポイントにする |
| 29 | [taeold/djev-run](https://github.com/taeold/djev-run) | 590 | 39 | 0 | 09-20 | 10-14 | HTML | Apache-2.0 | P | 実験的な DiffusionGemma-Jev を Cloud Run GPU で配信 |
| 30 | [StartLuxLabs/StartLux-Prism](https://github.com/StartLuxLabs/StartLux-Prism) | 560 | 5 | 3 | 10-13 | 10-27 | Python | none | P | StartLux-Decision の NVIDIA GPU 向け高速推論（GGUF） |

出典：[`typed decision ... stars:>=100`](https://api.github.com/search/repositories?q=typed%20decision%20created%3A%3E%3D2026-09-01%20stars%3A%3E%3D100)、[`topic:jev`](https://api.github.com/search/repositories?q=topic%3Ajev)、[`"decision model" ... stars:>=100`](https://api.github.com/search/repositories?q=%22decision%20model%22%20created%3A%3E%3D2026-09-01%20stars%3A%3E%3D100) などの検索結果を、README 冒頭で確認したうえで分類した。作成日・push 日は特記がなければ 2026 年。

- 31 位以下は OmniJev/Flide（532）、undrgrnd-labs/hunch（515）、Yinsongxu/LLM2Jev（491）、Zefan-Cai/Open-Jev（452）、PostHog/jeeves（442）、mohit67890/imajev（434）、Fruank4/laya-ort（382）、malevrigns/agent-jev（368）、ekzhang/openjev-sglang（334）と続く。「OpenJev」を名前に含むものの★は、SemIf-OpenJev 4,963、razorback16/openjev 792、ekzhang/openjev-sglang 334、Heman10x-NGU/openJev-verdict-2.0 306、SiliconLabAI/OpenJev 187、alanhuangyoo/OpenJev 72 の順だった。— [API](https://api.github.com/search/repositories?q=openjev%20in%3Aname)

#### 集中度と★帯（筆者集計）
| 集合 | n | 合計★ | 中央値 | 上位1 | 上位5 | 上位10 | 上位30 | ★0 | ★1–9 | ★10–99 | ★100–999 | ★1,000+ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| コア OpenJev 系（全和集合） | 1,197 | 109,578 | 1 | 32.5% | 55.6% | 66.0% | 84.4% | 540 | 433 | 145 | 62 | 17 |
| 狭義プール（FP 除く） | 597 | 28,317 | 1 | 35.4% | 68.4% | 81.7% | 93.6% | 284 | 233 | 59 | 15 | 6 |
| Jev 関連全体（コア＋周辺ツール） | 3,808 | 229,470 | 2 | 15.5% | 37.8% | 47.2% | 61.0% | 1,345 | 1,554 | 665 | 215 | 29 |

狭義プールの上位 1 は jaredpalmer/kev（説明文に "Jev-like" を含む）。Laya は説明文に "Jev" を含まないので狭義プールには入らない。

- `jev in:name created:>=2026-09-01`（11,921 件）の★帯は ★0 が 8,501（71.3%）、★1–9 が 2,847（23.9%）、★10–99 が 444（3.7%）、★100–999 が 115（1.0%）、★1,000+ が 14（0.1%）だった（13:08Z）。— [API ★0](https://api.github.com/search/repositories?q=jev%20in%3Aname%20created%3A%3E%3D2026-09-01%20stars%3A0); [API ★1000+](https://api.github.com/search/repositories?q=jev%20in%3Aname%20created%3A%3E%3D2026-09-01%20stars%3A%3E%3D1000)
- 参考として、Jev API を使う周辺ツール側の上位は次のとおり。browser-use/jev-ultrafast ★24,562、jev-chat/jev-chat-jarvis ★8,429、tamaratran/fast-jev-compaction ★7,989、dzhng/jevgrep ★3,241、jarrodwatts/jev-trader ★3,138、yibie/awesome-jev ★2,603。最大の awesome リストより、Laya 1 件の★のほうが多い。— [API](https://api.github.com/search/repositories?q=jev%20in%3Aname)
- Trendshift は Laya の★を +35,617（9/18〜11/17 の 61 日間）とし、最大の日次増は 9/22 の +6,379、次いで 9/21 の +6,077 としている。— [Trendshift 244591](https://trendshift.io/repositories/244591)
- 集計サイトのスナップショットは古いことがある。OSSInsight は SemIf-OpenJev を★4,373 と表示しているが、API では 4,963 だった。— [OSSInsight](https://ossinsight.io/analyze/TheoLeeCJ/SemIf-OpenJev); [API](https://api.github.com/search/repositories?q=openjev%20in%3Aname)

### Inferences
- 「OpenJev 系」の注目は Laya に一極集中しており、Laya の派生（MLX・Core ML・ONNX・Node・C++・PHP・Ascend への移植、laya-server、アプリ）が二次的な★を集めるハブ構造になっている。Kev（Qwen ベースで SDK 互換）が第 2 極である。
- 「OpenJev」というブランド名を冠したもので★1,000 を超えるのは SemIf-OpenJev だけである。この名前は初週の近似実装群を指す呼び名にとどまったと見られる。

### Gaps
- ★は API 取得時点の値。Trendshift などとの差は取得時刻の違いによるもので、bot による★水増しの有無は検証していない。
- コア全体の合計★は全和集合に依存する。取得漏れがあるとすれば★の小さいロングテールなので、集中度は大きくは変わらない見込みだが、正確な母数ではない。

## 4. 活動状況：直近 30 日の更新と初週での放棄、主要リポジトリの継続性

### Takeaway
大多数は作ってすぐ止まっている。コアの 64% は最終 push が作成から 7 日以内で、37% は作成日当日が最終 push だった。2026-10-18 以降に push があるのは 30%（353/1,197）にとどまる。名前に jev を含む全体では 21%（2,529/11,922）。一方で上位 30 件のうち 20 件は 10/18 以降も push があり、Laya・laya-mlx・laya-coreml・ollaya・strands-decider・Valen は活発に開発が続いている。初週の象徴だった SemIf-OpenJev・jevlike・localjev・rizzo-flow・razorback16/openjev は休眠状態にある。

### Cited Findings

#### 集合別の活動指標（筆者集計。push は `pushed_at` の日付で判定）
| 集合 | n | 10-18 以降 push | 11-10 以降 push | 最終 push が作成から 7 日以内 ※ | 作成日当日が最終 push | archived |
|---|---:|---:|---:|---:|---:|---:|
| コア OpenJev 系 | 1,197 | 353（29.5%） | 137（11.4%） | 741/1,153（64.3%） | 442（36.9%） | 11 |
| 狭義プール（FP 除く） | 597 | 154（25.8%） | 50（8.4%） | 393/578（68.0%） | 248 | 9 |
| ★100 以上の Jev 関連（09-01 以降作成） | 340 | 200（58.8%） | 116（34.1%） | 93/334（27.8%） | 33 | 3 |
| Jev 関連全体（コア＋周辺ツール） | 3,808 | 1,267（33.3%） | 511（13.4%） | 2,219/3,696（60.0%） | 1,264 | 28 |
| コア上位 30 | 30 | 20 | 9 | — | — | 0 |

※ 7 日経過を判定できる、11-03 以前作成分を分母にした。出典：[コア上位の例](https://api.github.com/search/repositories?q=%22typed%20decisions%22)、[狭義の例](https://api.github.com/search/repositories?q=%22jev-compatible%22)。

#### API 件数による直接の確認（13:06–13:07Z）
- `jev in:name created:>=2026-09-01 pushed:>2026-10-18` は 2,529 件（11,922 件の 21.2%）。`pushed:>2026-11-10` は 685 件（5.7%）。— [API](https://api.github.com/search/repositories?q=jev%20in%3Aname%20created%3A%3E%3D2026-09-01%20pushed%3A%3E2026-10-18); [API](https://api.github.com/search/repositories?q=jev%20in%3Aname%20created%3A%3E%3D2026-09-01%20pushed%3A%3E2026-11-10)
- 同じく 10-18 以降に push があった件数は次のとおり。
  - `openjev in:name`：18/103（17.5%）
  - `openjev` 全文（09-01 以降）：370/948（39.0%）
  - `"jev-compatible"`：33/152（21.7%）
  - `"typed decisions"`：263/881（29.9%）
  - `topic:jev`（09-01 以降）：814/2,901（28.1%）
  - `topic:openjev`：3/22

  — [API](https://api.github.com/search/repositories?q=openjev%20in%3Aname%20pushed%3A%3E2026-10-18); [API](https://api.github.com/search/repositories?q=openjev%20in%3Aname%2Cdescription%2Creadme%20created%3A%3E%3D2026-09-01%20pushed%3A%3E2026-10-18); [API](https://api.github.com/search/repositories?q=%22jev-compatible%22%20pushed%3A%3E2026-10-18); [API](https://api.github.com/search/repositories?q=topic%3Ajev%20created%3A%3E%3D2026-09-01%20pushed%3A%3E2026-10-18)

#### 週次コホート別の放棄率（`jev in:name`。早期停止＝最終 push が「作成週の末日＋7 日」以前）
| 作成週 | 作成数 | 早期停止 | 比率 | 10-18 以降 push | 比率 |
|---|---:|---:|---:|---:|---:|
| 09-14〜09-20 | 2,892 | 2,331 | 80.6% | 263 | 9.1% |
| 09-21〜09-27 | 4,484 | 3,674 | 81.9% | 473 | 10.5% |
| 09-28〜10-04 | 1,673 | 1,404 | 83.9% | 199 | 11.9% |
| 10-05〜10-11 | 915 | 774 | 84.6% | 141 | 15.4% |
| 10-12〜10-18 | 629 | 542 | 86.2% | 163 | 25.9%（判定期間が重なる） |

出典：[コホート例（早期停止）](https://api.github.com/search/repositories?q=jev%20in%3Aname%20created%3A2026-09-14..2026-09-20%20pushed%3A%3C%3D2026-09-27)、[コホート例（10/18 以降に push あり）](https://api.github.com/search/repositories?q=jev%20in%3Aname%20created%3A2026-09-14..2026-09-20%20pushed%3A%3E2026-10-18)（13:07Z）。10-19 以降の週は観察期間が足りないので省いた。

#### 主要リポジトリの継続性（commit 数は search/commits の `committer-date:>2026-10-18`。13:08–13:17Z 取得）
| リポジトリ | ★ | 最終 push | 10/18 以降の commit | 累計 commit | 累計 Issue | 累計 PR | 10/18 以降の Issue | 筆者判定 |
|---|---:|---|---:|---:|---:|---:|---:|---|
| NandhaKishorM/laya | 35,630 | 11-16 | 543 | 2,941 | 223 | 1,212 | 26 | 活発 |
| jaredpalmer/kev | 10,033 | 11-15 | 5 | 350 | 53 | 234 | 19 | 継続（Issue は活発） |
| mizorewww/laya-mlx | 7,108 | 11-17 | 40 | 52 | 10 | 20 | 2 | 活発 |
| TheoLeeCJ/SemIf-OpenJev | 4,963 | 09-23 | 0 | 25 | 23 | 40 | 0 | 休眠 |
| Contrastive-LM/CLM | 3,208 | 10-05 | 0 | – | 15 | 22 | – | 休眠 |
| deepopen-com/deepopen | 3,075 | 11-03 | 6 | – | 6 | 11 | – | 低頻度 |
| TianyuCodings/NanoJev | 2,600 | 10-16 | 0 | 43 | 8 | 8 | 0 | 休眠 |
| bespokelabsai/nimble | 2,311 | 11-14 | 3 | 22 | 6 | 22 | 2 | 低頻度 |
| StartLuxLabs/StartLux-Decision | 1,765 | 10-23 | 2 | – | 14 | 8 | – | 低頻度 |
| mizorewww/laya-coreml | 1,640 | 11-17 | 37 | 46 | 6 | 2 | 0 | 活発 |
| nokia-applied-research/AnyJev | 1,619 | 10-21 | 1 | 57 | 12 | 9 | 1 | 減速 |
| firelex/jeff | 1,603 | 11-06 | 8 | – | 9 | 12 | – | 継続 |
| ollaya-dev/ollaya | 1,469 | 11-10 | 98 | 339 | 50 | 121 | 7 | 活発 |
| vinnylarouge/jevlike | 1,371 | 09-16 | 0 | 3 | 3 | 5 | 0 | 作成日以降 push なし |
| strands-labs/strands-decider | 1,212 | 11-17 | 26 | 55 | 48 | 102 | 19 | 活発 |
| receptron/laya | 1,081 | 10-17 | 0 | 22 | 6 | 9 | 0 | 休眠 |
| Mapika/decider | 1,055 | 10-20 | 6 | – | 18 | 3 | – | 減速 |
| TypeLLM/TypeLLM | 982 | 10-25 | 6 | – | 4 | 37 | – | 減速 |
| feder-cr/jev | 971 | 10-18 | 0 | – | 10 | 33 | – | 休眠 |
| Rizzo-AI-Academy/rizzo-flow | 965 | 09-25 | 0 | – | 14 | 20 | – | 休眠 |
| mode-io/vllm-jev | 954 | 10-22 | 46 | – | 3 | 10 | – | 10 月下旬に集中、以後停止 |
| wfzyx/von | 922 | 10-19 | 1 | – | 18 | 6 | – | 減速 |
| Valen-Team/Valen | 922 | 11-15 | 67 | – | 12 | 37 | – | 活発 |
| githubnext/localjev | 843 | 09-18 | 0 | – | 1 | 2 | – | 作成日以降 push なし |
| InternLM/Intern-Decision | 809 | 11-16 | 6 | – | 7 | 1 | – | 継続 |
| razorback16/openjev | 792 | 10-13 | 0 | – | 6 | 8 | – | 休眠 |
| ekzhang/openjev-sglang | 334 | 10-01 | 0 | – | 3 | 5 | – | 休眠 |
| Heman10x-NGU/openJev-verdict-2.0 | 306 | 10-21 | 0 | – | 3 | 4 | – | 休眠気味 |
| SiliconLabAI/OpenJev | 187 | 09-22 | 0 | – | 2 | 2 | – | 休眠 |
| alanhuangyoo/OpenJev | 72 | 10-09 | 0 | – | 0 | 0 | – | 休眠 |

出典の例：[Laya の Issue](https://api.github.com/search/issues?q=repo%3ANandhaKishorM%2Flaya%20is%3Aissue)、[Laya の 10/18 以降 commit](https://api.github.com/search/commits?q=repo%3ANandhaKishorM%2Flaya%20committer-date%3A%3E2026-10-18)、[Laya の累計 commit](https://api.github.com/search/commits?q=repo%3ANandhaKishorM%2Flaya%20committer-date%3A%3E2000-01-01)。他のリポジトリも同じ形式のクエリで取得した。累計 commit の列で「–」は未取得。
- Trendshift の記録では、Laya は全言語で 9/20〜9/23 に 1 位、9/26 以降はトレンド外。Python 部門では 9/30 以降トレンド外になった。61 日間でマージ済み PR は 1,021 件、コントリビューターは 1 名と表示されている。— [Trendshift 244591](https://trendshift.io/repositories/244591)
- alanhuangyoo/OpenJev（Trendshift 285036）は 44 日間で★+16・fork+6・マージ PR 0 で、Trendshift の上位 25 には入っていない。MartOcd1709/openjev-guardrail-redteam（257408）は 57 日間で★+0。— [Trendshift 285036](https://trendshift.io/repositories/285036); [Trendshift 257408](https://trendshift.io/repositories/257408)

### Inferences
- 「初週に作って放置」が支配的なパターンである。ローンチ週のコホートでは 8 割が 2 週目以降 push しておらず、10 月中旬にまだ動いていたのは 1 割程度だった。
- 生き残りの条件は、学習済み重みを配布していること（Laya、Kev、Valen、StartLux、Intern-Decision）か、ランタイム・サーバーとして他のプロジェクトから依存されていること（laya-mlx、laya-coreml、ollaya）に見える。既存 LLM に Jev 風の I/O を被せただけの初期の近似実装（SemIf-OpenJev、rizzo-flow、localjev、razorback16/openjev、openjev-sglang）は、軒並み 9〜10 月に止まった。
- Laya の commit・PR 量（累計 2,941 commit、1,212 PR、Trendshift 上はコントリビューター 1 名）は、自動化やボットによる運用を示唆している。人手のコミュニティ規模の指標として読むのは避けたほうがよい（推測）。

### Gaps
- search/commits は既定ブランチの commit だけを数え、`committer-date` は rebase などで実際の push 日とずれる。そのため「push はあるが commit 0」となるケースがある（例：openJev-verdict-2.0）。
- コアの全件について commit 数は取得していない（レート制限のため上位約 30 件に絞った）。

## 5. ライセンス・言語・カテゴリの構成

### Takeaway
コア OpenJev 系はかなり許容的なライセンスに寄っている（MIT 36%、Apache-2.0 29%）。ただしライセンス未設定が 27% ある。上位 30 件に限ると Apache-2.0 が 21 件、MIT が 7 件、未設定が 2 件で、Apache が優勢だった。言語は Python が 63% を占め、TypeScript・JavaScript（計 14%）、Rust（5%）、Go・C++・Swift（各 1〜2%）が続く。カテゴリ別ではモデル（M）が件数の 47%・★の 66% を占め、API サーバー・近似アダプタ（S）が 24%、ポート（P）が 18%、マルチモーダル（MM）が 7%、ドメイン特化（D）が 3% だった。

### Cited Findings

#### ライセンス構成（`license.spdx_id`、筆者集計）
| 集合 | MIT | Apache-2.0 | none（未設定） | NOASSERTION | その他 |
|---|---:|---:|---:|---:|---|
| コア（1,197） | 435（36%） | 345（29%） | 329（27%） | 70（6%） | GPL-3.0 6、AGPL-3.0 5、MPL-2.0 2、BSD-3 2 |
| コア上位 30 | 7 | 21 | 2（nimble、StartLux-Prism） | 0 | — |
| 狭義プール（597） | 244（41%） | 124（21%） | 186（31%） | 30（5%） | CC0 5、AGPL 4、GPL-3.0 2 |
| ★100 以上の Jev 関連（340） | 166（49%） | 83（24%） | 36（11%） | 30（9%） | CC0 11、AGPL 8、GPL-3.0 5 |
| Jev 関連全体（3,808） | 1,870（49%） | 716（19%） | 892（23%） | 209（5%） | CC0 37、AGPL 28、GPL-3.0 22 |

出典：[`"typed decisions"`](https://api.github.com/search/repositories?q=%22typed%20decisions%22) などの品目データ。
- 重みのライセンスはリポジトリのライセンスと別の場合がある。Rapid-MLX の README は、OpenJev 27B の重みを「CC BY-NC 4.0（非商用）」と明記している。— [Rapid-MLX README](https://raw.githubusercontent.com/raullenchai/Rapid-MLX/HEAD/README.md)

#### 主要言語の構成
| 集合 | Python | TypeScript | JavaScript | Rust | HTML | 言語なし | Go | C++ | Swift | その他 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| コア（1,197） | 750（63%） | 87（7%） | 80（7%） | 57（5%） | 48（4%） | 42（4%） | 25（2%） | 13（1%） | 12（1%） | Jupyter 16 |
| コア上位 30 | 25 | 2 | 0 | 1 | 1 | 0 | 0 | 1 | 0 | — |
| Jev 関連全体（3,808） | 1,934（51%） | 635（17%） | 379（10%） | 145（4%） | 141（4%） | 159（4%） | 87（2%） | — | 37（1%） | C# 35 |

出典：同上。

#### カテゴリ構成
| 区分 | コア件数（全和集合） | ★合計 | うち手作業分類 | 狭義プールでの件数 |
|---|---:|---:|---:|---:|
| M モデル/学習・再現 | 567（47.4%） | 72,468 | 52 | 220 |
| S Jev 互換サーバー/近似アダプタ | 286（23.9%） | 17,382 | 43 | 149 |
| P ポート/ランタイム（MLX、Core ML、ONNX、llama.cpp、vLLM/SGLang、Swift、Rust、CPU edge、PHP、Ascend など） | 219（18.3%） | 14,700 | 26 | 80 |
| MM マルチモーダル | 85（7.1%） | 4,096 | 14 | 25 |
| D ドメイン/言語特化（ポーランド語、インド諸語、中国語、医療、求人、自動運転、コード品質など） | 40（3.3%） | 932 | 7 | 11 |
| 周辺ツール：PL / APP / B / L（Jev 関連全体） | 792 / 1,007 / 624 / 188 | 33,064 / 67,648 / 4,918 / 14,262 | 129（4 区分合計） | 3 / 10 / 78 / 16 |

出典：[`"jev-style"`](https://api.github.com/search/repositories?q=%22jev-style%22)、[`"jev-like"`](https://api.github.com/search/repositories?q=%22jev-like%22) ほか全クエリの和集合を分類した結果。
- カテゴリ別の代表例は次のとおり（いずれも手作業分類）。
  - ポート：laya-mlx、laya-coreml、receptron/laya（ONNX/Node）、lkarlslund/laya.cpp（CUDA/Vulkan/Core ML/CPU）、marcreichel/laya-php、zzhdbw/laya-Ascend、cappuch/openjev.cpp、SiliconLabAI/OpenJev-Cactus（CPU エッジ）、Algorythm-Canada/OpenJevSwift、mode-io/vllm-jev
  - マルチモーダル：Valen、Intern-Decision、imajev、MCG-NJU/VideoJev、OmniJev/OneJev、adventists-ai/duplexjev（音声）
  - ドメイン特化：rkinas/basal（ポーランド語/英語）、SAGAR-TAMANG/sarvam-jev（インド諸語）、vindahi/Medical-OpenJev、DECRUX9812/openjev（求人票）、benmagnifico/DriveJev（自動運転）
  - ベンチマーク：fstandhartinger/jevbench、Valen-Team/JevalKit、StartLuxLabs/DecisionPivot、apolinario/decision-index

  — [API](https://api.github.com/search/repositories?q=laya%20created%3A%3E%3D2026-09-01%20stars%3A%3E%3D50); [API](https://api.github.com/search/repositories?q=openjev%20in%3Aname)

### Inferences
- 上位では Apache-2.0 が主流で、企業や研究組織による公開（Nokia Applied Research、InternLM、Together、PostHog、GitHub Next、Featherless など）が目立つ。ロングテールの個人リポジトリではライセンス未設定が約 3 割あり、再利用には法的なリスクが残る。
- Python が支配的なのは、モデルの学習・推論が主戦場だからである。周辺ツール側（Jev API を呼ぶ側）で TypeScript の比率が上がる（17%）のは、エージェントや IDE のプラグインが多いためと考えられる。

### Gaps
- `NOASSERTION`（独自・複合ライセンス）の中身と、重み（Hugging Face 側）のライセンスは個別に確認していない。
- カテゴリのロングテールはルール分類なので、M/S の境界（学習済みモデルか、既存 LLM のアダプタか）は誤分類がありうる。

## 6. 同時期にトレンド入りした隣接リポジトリ

### Takeaway
2026-09-01 以降に作成され★1,000 以上を得たリポジトリは GitHub 全体で 737 件あり、その★上位 200 件のうち 11 件が Jev 関連だった（コア 6、周辺ツール 5）。Laya は全体の 7 位に入る。隣接領域では、既存の大型推論サーバーが Jev 互換の `/v1/systemone` を相次いで実装した（LocalAI、ik_llama.cpp、omlx、Rapid-MLX、colibri）。これが Jev 互換 API を事実上の標準にしている。拡散 LM（DiffusionGemma）や非自己回帰の分類器・決定エンジンも、主に OpenJev 系の文脈で伸びている。

### Cited Findings
- `created:>=2026-09-01 stars:>=1000` は 737 件（13:08Z）。★上位 200 件（200 位は★3,055）のうち Jev 関連は次の 11 件だった。
  - コア：#7 NandhaKishorM/laya（35,631）、#41 jaredpalmer/kev、#83 mizorewww/laya-mlx、#119 TheoLeeCJ/SemIf-OpenJev、#189 Contrastive-LM/CLM、#197 deepopen-com/deepopen
  - 周辺ツール：#13 browser-use/jev-ultrafast、#56 jev-chat/jev-chat-jarvis、#65 tamaratran/fast-jev-compaction、#187 dzhng/jevgrep、#193 jarrodwatts/jev-trader

  1〜6 位（storytold/photocraft ★79,982 など）は無関係だった。— [API](https://api.github.com/search/repositories?q=created%3A%3E%3D2026-09-01%20stars%3A%3E%3D1000)
- 名前・説明・README のどこかに jev を含み、09-01 以降に作成され★100 以上のリポジトリは 324 件、うち★1,000 以上は 42 件。42 件の内訳は README のみで言及 15、M 9、APP 6、PL 4、S 3、L 2、ADJ 2、P 1。— [API](https://api.github.com/search/repositories?q=jev%20in%3Aname%2Cdescription%2Creadme%20created%3A%3E%3D2026-09-01%20stars%3A%3E%3D100)
- Jev 互換 API を採用した既存の大型プロジェクト（README で確認）：
  - mudler/LocalAI（★50,412）：「October 2026: LocalAI 4.11.0 … the Decisions API (`/v1/systemone`)」 — [README](https://raw.githubusercontent.com/mudler/LocalAI/HEAD/README.md)
  - ikawrakow/ik_llama.cpp（★3,401）：「`/v1/systemone` endpoint for decision models (lev, OpenJev, nimble) [PR 2592]」 — [README](https://raw.githubusercontent.com/ikawrakow/ik_llama.cpp/HEAD/README.md)
  - jundot/omlx（★23,687）：`POST /v1/systemone` を提供し、対応モデルに OpenJev を含む — [README](https://raw.githubusercontent.com/jundot/omlx/HEAD/README.md)
  - raullenchai/Rapid-MLX（★4,159）：TypeSafe 互換の `/v1/systemone` を提供し、既定は Laya-MLX、OpenJev 27B（CC BY-NC 4.0）にも対応 — [README](https://raw.githubusercontent.com/raullenchai/Rapid-MLX/HEAD/README.md)
  - JustVugg/colibri（★51,671）：「Switching from Jev. The request and the reply are those of TypeSafe's Jev」 — [README](https://raw.githubusercontent.com/JustVugg/colibri/HEAD/README.md)
- API 文字列の拡散度：`"v1/systemone"` を name/desc/README に含むリポジトリは 7,383 件。コード検索では `"v1/systemone"` が 132,864 件、`"api.typesafe.ai"` が 49,088 件、`"import openjev"` が 524 件ヒットした（13:13–13:14Z）。— [API repos](https://api.github.com/search/repositories?q=%22v1%2Fsystemone%22%20in%3Aname%2Cdescription%2Creadme); [API code](https://api.github.com/search/code?q=%22v1%2Fsystemone%22); [API code](https://api.github.com/search/code?q=%22api.typesafe.ai%22); [API code](https://api.github.com/search/code?q=%22import%20openjev%22)
- 決定モデル・System One の隣接クエリ（09-01 以降作成）：
  - `"decision model"`：2,816 件（★100 以上は 49 件）
  - `"calibrated probabilities"`：317 件
  - `"non-autoregressive"`：125 件
  - `calibration stars:>=100`：25 件。上位は Laya、StartLux-Decision、AnyJev、ollaya などの決定モデル系
  - `classifier stars:>=100`：8 件
  - `"decision engine" stars:>=50`：7 件（deepopen ★3,075 など）
  - タグでは `topic:system-one` が 584 件、`topic:decision-model` が 577 件

  — [API](https://api.github.com/search/repositories?q=%22decision%20model%22%20created%3A%3E%3D2026-09-01); [API](https://api.github.com/search/repositories?q=calibration%20created%3A%3E%3D2026-09-01%20stars%3A%3E%3D100); [API](https://api.github.com/search/repositories?q=%22decision%20engine%22%20created%3A%3E%3D2026-09-01%20stars%3A%3E%3D50)
- 拡散 LM：`"diffusion language model" created:>=2026-09-01` は 109 件で、最上位は vladimirrott/mojo-dllm（★541）。`diffusiongemma in:name,description,readme` は 877 件で、既存の推論系（mistral.rs、mlx-vlm、unslothai/notebooks、google-gemma/cookbook）も含む。OpenJev 系では razorback16/openjev、githubnext/localjev、taeold/djev-run、mmastrac/djev（vLLM PR の example server）、Hangzhi/diffusion-jev-sglang、Davipar/djev-dev が DiffusionGemma を使う。githubnext/localjev の README は、razorback16/openjev が「unmerged vLLM request extensions」に依存すると書いている。— [API](https://api.github.com/search/repositories?q=%22diffusion%20language%20model%22%20created%3A%3E%3D2026-09-01); [API](https://api.github.com/search/repositories?q=diffusiongemma%20in%3Aname%2Cdescription%2Creadme); [localjev README](https://raw.githubusercontent.com/githubnext/localjev/HEAD/README.md)
- 小型の非自己回帰の分類器・決定モデル：Heman10x-NGU/openJev-verdict-2.0（151M、ModernBERT ベース）、Phocinae-Largha-150M-v1（144.3M）、intikhab49/open-jev-typed-decision-engine（150M）、nicobrenner/jeffy（CPU 向け分類器）など。`RLCD`（Jev の学習法の名称）を含むリポジトリは 1,530 件ある。— [API](https://api.github.com/search/repositories?q=%22non-autoregressive%22%20created%3A%3E%3D2026-09-01); [API](https://api.github.com/search/repositories?q=rlcd%20in%3Aname%2Cdescription%2Creadme)
- Trendshift：Laya は Daily #1・Weekly #1・Monthly #4 のバッジを持つ。関連リポジトリとして rkinas/basal、SelfJev、LLM2Jev、simonw/llm-openai-decisions、bespokelabsai/nimble、Abhinavexists/lev などが表示される。nimble は README で「#4 repository of the day on Trendshift」と自己申告している。— [Trendshift 244591](https://trendshift.io/repositories/244591); [nimble README](https://raw.githubusercontent.com/bespokelabsai/nimble/HEAD/README.md)
- メディアの取り上げ方：2026-10-07 の Analytics Vidhya「10 Jev Projects on GitHub」は、10 件中 9 件が Jev API を使うアプリ・ツールで、オープン代替は SemIf だけだった。— [Analytics Vidhya](https://www.analyticsvidhya.com/blog/2026/10/jev-projects-on-github/)

### Inferences
- 「OpenJev 系」の影響は、個々のクローンの★より、既存の推論サーバー群が `/v1/systemone` を標準機能として取り込んだ点に強く表れている。互換 API が定着したことで、個別のクローンが放棄されても「Jev 互換」の需要は残る構図である。
- 同時期の GitHub 全体のトレンド上位（★上位 200 件）で Jev 関連は約 5%（11 件）と目立つが、上位 1〜6 位はすべて別ジャンルだった。「その期間で最大の話題」ではなく「主要テーマの一つ」という位置づけが妥当である。

### Gaps
- trendshift.io の 285036・257408 は個別ページを取得して確認したが、Trendshift のジャンル別ランキング全体や OSSInsight の時系列データは取得できなかった（OSSInsight はページの描画値がほぼ空だった）。
- 非自己回帰の分類器や calibration ツールで、Jev と無関係に伸びたものは、検索した範囲では★100 以上にほとんど見当たらなかった。ただし網羅検索はしていない。

## 7. 上位リポジトリの Issue / PR 量（実利用のシグナル）

### Takeaway
実利用の厚みも Laya に集中している（累計 Issue 223・PR 1,212、10/18 以降の新規 Issue 26）。次いで Kev（Issue 53・PR 234、10/18 以降 19）、ollaya（50・121）、strands-decider（48・102、10/18 以降 19）が続く。多くのクローンは Issue が 0〜20 件程度で、外部からの利用はごく限られる。リポジトリ横断では `openjev` に言及する Issue が 828 件（うち 10/18 以降 103 件）、PR が 1,649 件あり、他プロジェクトへの統合要望が継続していることがわかる。

### Cited Findings
- 上位の Issue・PR 累計（search/issues の `repo:X is:issue` / `is:pr`、13:08–13:17Z）：
  - 20 件以上：Laya 223/1,212、Kev 53/234、ollaya 50/121、strands-decider 48/102、SemIf-OpenJev 23/40
  - 10〜20 件台：Mapika/decider 18/3、von 18/6、CLM 15/22、rizzo-flow 14/20、StartLux-Decision 14/8、AnyJev 12/9、Valen 12/37、laya-mlx 10/20、feder-cr/jev 10/33
  - 10 件未満：firelex/jeff 9/12、NanoJev 8/8、Intern-Decision 7/1、deepopen 6/11、nimble 6/22、laya-coreml 6/2、receptron/laya 6/9、razorback16/openjev 6/8、TypeLLM 4/37、jevlike 3/5、vllm-jev 3/10、openjev-sglang 3/5、openJev-verdict-2.0 3/4、SiliconLabAI/OpenJev 2/2、localjev 1/2、alanhuangyoo/OpenJev 0/0

  — [Laya](https://api.github.com/search/issues?q=repo%3ANandhaKishorM%2Flaya%20is%3Aissue); [Kev](https://api.github.com/search/issues?q=repo%3Ajaredpalmer%2Fkev%20is%3Aissue); [ollaya](https://api.github.com/search/issues?q=repo%3Aollaya-dev%2Follaya%20is%3Apr)
- 10/18 以降に作成された Issue：Laya 26、Kev 19、strands-decider 19、ollaya 7、laya-mlx 2、nimble 2、AnyJev 1。SemIf-OpenJev、NanoJev、jevlike、laya-coreml、receptron/laya は 0。— [Kev（10/18 以降）](https://api.github.com/search/issues?q=repo%3Ajaredpalmer%2Fkev%20is%3Aissue%20created%3A%3E2026-10-18)
- リポジトリ横断の言及（13:13Z）：`openjev is:issue` 828 件、`openjev is:issue created:>2026-10-18` 103 件、`openjev is:pr` 1,649 件、`"jev-compatible" is:issue` 750 件。— [API](https://api.github.com/search/issues?q=openjev%20is%3Aissue); [API](https://api.github.com/search/issues?q=openjev%20is%3Aissue%20created%3A%3E2026-10-18); [API](https://api.github.com/search/issues?q=openjev%20is%3Apr); [API](https://api.github.com/search/issues?q=%22jev-compatible%22%20is%3Aissue)
- Discussions を有効にしているのは、コア上位 30 件中 6 件（laya、ollaya、TypeLLM、feder-cr/jev、vllm-jev、Phocinae-Largha）だった（search 結果の `has_discussions` フラグ）。— [API](https://api.github.com/search/repositories?q=topic%3Ajev)

### Inferences
- Issue の量で見ると「実際に使われている OpenJev 系」は、Laya、Kev、ollaya、strands-decider の 4 つにほぼ絞られる。★上位でも SemIf-OpenJev のように 9 月以降 Issue が増えていないものは、話題性による★と見るのが妥当である。
- `openjev` 言及の PR（1,649 件）が Issue（828 件）の約 2 倍あるのは、他リポジトリへの統合 PR（モデル対応の追加など）が多いためと推測される。ik_llama.cpp の PR 2592 はその例である。

### Gaps
- GitHub Discussions の件数は REST の search で取得できず、GraphQL は今回の制約で使えないため未取得。
- `open_issues_count` は Issue と PR の合算値で、search の `is:issue` とは一致しない。ボットが作った Issue・PR の除外もしていない。
- コード検索（`"v1/systemone"` 132,864 件など）はファイル単位の概数で、重複や vendored コードを含む可能性が高い。規模感の指標としてだけ使うべきである。

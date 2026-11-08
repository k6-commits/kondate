# 既存の献立・料理アプリへの不満、AIレシピへの批判、失敗事例と教訓

調査日：2026-11-08（担当：ユーザーの不満・失敗事例）。★は App Store の星評価。

> **調査上の制約**：作業の途中で全エージェント共有の Web 検索上限に達した。そのため後半は、取得済み URL の直接取得、学術 DB（Europe PMC）の書誌取得、App Store 公開レビューの一次分析で補った。The Guardian と Reddit は取得できなかった。裏付けのない項目は「未確認」と明記している。

## 0. 要点

1. **不満の筆頭は課金の仕方**。米国 App Store の★1–2 レビュー 628 件（8 アプリ、2025-01〜2026-11）を分類すると、価格・ペイウォールへの言及が平均 36%（8 アプリ中 7 つで 20% 超）、強制トライアル・解約後請求などの請求トラブルが 22% だった。
2. **次に多いのは信頼性の問題**：同期・ログイン不良（18%）、サポート無反応、買い物リストの重複・単位ミス、取り込み失敗（各 9〜10%）、買収・更新後の改悪。
3. **AI への反応は二極化**：AI 献立は「冗談レベル」「無料の ChatGPT で十分」と評される。NYT Cooking が外せない AI 機能を入れた 2026 年 10 月以降、同アプリの低評価率は 9%→34% に上がった。
4. **研究の示すこと**：LLM の献立にはエネルギー過小、たんぱく質・脂質過多、微量栄養素不足、アレルゲン混入（56 件中 4 件）、ばらつきが報告されている。栄養 DB とルール検証を組み合わせると、制約充足率は 96.8〜98.5% に上がる。
5. **閉鎖が続いている**：Yummly（2024-12）、Mealime（2026-10-21）、AI 献立から出発した Ollie（2026-11-06）。原因は親会社の都合や AI アシスタントとの競合で、いずれもデータ移行が弱かった。

## 1. 主要アプリへの不満・要望

### 1-1. 頻度感：App Store 低評価レビューの定量分析

**方法**：App Store 公開レビュー RSS[14] で各アプリの最新最大 500 件を 2026-11-08 に取得し、2025-01-01 以降の★1–2 を正規表現で多重ラベル分類した（筆者実施）。対象は★1–2 が 20 件以上あった 8 アプリで、計 628 件（うち ReciMe が 227 件）。

**限界**：米国の iOS のみで、キーワード分類には誤検出がある。最新 500 件に限られるため、直近のイベントに敏感に反応する。Mealime・Ollie・Yummly はストアから消え、Allrecipes アプリは 2023 年に終了したため対象外。

| 不満カテゴリ | 平均言及率（等重み） | 20%超のアプリ | 突出アプリ |
|---|---|---|---|
| 価格・ペイウォール | **36%** | 7/8 | ReciMe 67%、eMeals 53%、MealPrepPro 51% |
| 強制トライアル・請求・解約 | **22%** | 3/8 | eMeals 60%、ReciMe 54%、MealPrepPro 38% |
| バグ・同期・ログイン | 18% | 2/8 | Samsung Food 36%、Paprika 33% |
| 買い物リスト | 10% | 2/8 | AnyList 30%、eMeals 22% |
| サポート無反応 | 10% | 2/8 | Paprika 22%、eMeals 20% |
| 買収・更新後の改悪 | 10% | 1/8 | Samsung Food 46% |
| 取り込み失敗 | 9% | 1/8 | Paprika 28% |
| AI 関連／広告 | 8%／8% | 各 1/8 | NYT Cooking 43%／Samsung Food 25% |
| 味・奇妙な組み合わせ／繰り返し／制限無視 | 各 4% | 0/8 | MealPrepPro 16%／eMeals 10%／Tasty 12% |
| データ消失／プライバシー | 3%／1% | 0/8 | AnyList（データ消失）15% |

- **平均★では不満が見えない**：対象アプリの平均★は 4.4〜4.9（例：NYT Cooking 4.91／約 55 万件。2026-11-08 時点）[1–13]。不満は直近の低評価比率の急変として表れる。
- **NYT Cooking**：2026-08-07〜10-12 の 363 件では★1–2 が 9%、10-13〜11-06 の 137 件では 34%。AI に触れた 36 件のうち 35 件が★1–2 だった[5]。
- **Paprika 4**：買い切りから「無料（1 端末 50 レシピまで）＋サブスク」に移行。公開直後の 8 件中 6 件が★1–2[2]。
- **ReciMe**：直近 500 件が★5＝216 件、★1＝199 件と二極化[7]。
- **反例**：有料のみ・広告なしの Plan to Eat は、直近 500 件中★1–2 が 1% だった[12]（レビュー誘導の有無は不明）。
- **第三者集計（参考値）**：Unstar（分析ツールの販売企業、2026-05-01、件数非開示）は、広告 18%、ペイウォール 15%、取り込み 12%、献立の繰り返し 11%、同期 8%、栄養精度 5% と報告している[15]。

### 1-2. カテゴリ別の代表的な声

原文は抜粋で、日付と★はレビューの記載どおり。

| カテゴリ（頻度感） | 原文 → 和訳 | 出典 |
|---|---|---|
| 課金（高） | "It was advertised as "completely free" As soon as you go through the intro it asks for a 7-day free trial." →「“完全無料”と宣伝していたのに、導入画面の直後に 7 日間トライアルを求められる」 | ReciMe 2026-11-04 ★1 [7] |
| 〃 | "This feature is locked behind their premium paywall."（週・月の献立作成が）→「プレミアム限定」 | Eat This Much 2025-07-29 ★1 [4] |
| 請求・解約（高） | "take the $40 from my bank account AFTER I cancelled." →「解約後に 40 ドル引き落とされた」 | ReciMe 2026-10-28 ★1 [7] |
| 広告（中） | "full page ads that take over every 10-15 seconds." →「10〜15 秒ごとに全画面広告」。有料の NYT でも "why are there ads?" | Samsung Food 2025-03-25 ★1 [1]／NYT 2026-11-05 [5] |
| 同期・データ消失・サポート（中〜高） | "the grocery list does not sync between our phones." →「夫婦の端末間で買い物リストが同期しない」／"Nothing. Crickets." →「（問い合わせに）返事なし」 | Samsung Food 2026-11-01 ★1 [1]／Paprika 2025-12-23 ★1 [2] |
| 取り込み失敗（中） | "can't save recipes from TikTok or IG." →「TikTok や Instagram から保存できない」／"it sometimes "Tweaks" the recipe" →「取り込み時にレシピが勝手に“改良”されることがある」（編集は AI チャット経由のみ、とも） | Paprika 2026-01-11 ★2 [2]／ReciMe 2026-10-27 ★2 [7] |
| 買い物リスト（中） | "it adds olive oil 5 times to my shopping list." →「オリーブ油が 5 回入る」／"9 12 oz bags of broccoli when I needed 3." →「3 袋で足りるのに 9 袋」 | Samsung Food 2026-11-04 ★1 [1]／eMeals 2026-04-16 ★1 [9] |
| AI 献立の品質（低〜中、増加中） | "The AI meal plans are kind of a joke unless you like to spend all day every day cooking." →「毎日一日中料理したい人以外にとって、AI 献立は冗談レベル」 | Samsung Food 2026-11-01 ★2 [1] |
| 汎用 AI との比較 | "all AI generated which chat gpt or Google Gemini can do for free" →「ChatGPT や Gemini なら無料」／"A free AI meal plan is much more personalized" →「無料の AI 献立のほうが個別化されている」 | MealPrepPro 2026-07-15 ★1 [8]／eMeals 2026-09-08 ★1 [9] |
| 強制 AI への反発（イベント時に高） | "I value recipes tested by people" →「人がテストしたレシピに価値がある」／"especially not ones I can't turn off" →「オフにできない AI はいらない」 | NYT Cooking 2026-10-20／11-05 ★1 [5] |
| 繰り返し（低〜中） | "The same disgusting recipes pushed over and over no matter how many times I block them." →「ブロックしても同じレシピが出続ける」 | Eat This Much 2026-05-08 ★1 [4] |
| 制限・アレルギー無視（頻度は低いが重大） | "my son is allergic to blueberries. Listed it as an exclusion… Meal plans listed a blueberry smoothie multiple times" →「除外登録したのにブルーベリースムージーが何度も出た」／"I'm gf and it's literally only suggesting recipes with gluten" →「グルテンフリーなのにグルテン入りばかり」 | Eat This Much 2024-09-21 ★2 [4]／Tasty 2026-03-05 ★1 [6] |
| 家族（中） | "does not accommodate larger families" →「大家族に対応しない」。専門家は "women start managing another thing" →「女性の管理対象が一つ増えるだけ」と指摘 | eMeals 2026-10-01 [9]／WaPo 2025-08-28 [16] |
| 入力の手間・導入画面（中） | "scan every items barcode? barrier to entry too high" →「全品バーコード読み取りはハードルが高すぎる」／"set up my profile just for them to ask for money" →「プロフィールを入れ終えたら課金要求」／"buy $100+ in groceries every week when I have food in my pantry" →「家に食材があるのに毎週 100 ドル超の買い物を指示」 | ChefGPT 2023-07-05 [11]／ReciMe 2026-11-04 [7]／Eat This Much 2025-03-08 [4] |
| 栄養計算（低〜中） | "1/4 cup butter… and 1/2 cup butter… produces exactly the same fat grams." →「バター 1/4 カップと 1/2 カップで脂質が同じ」／"6 1/2 servings of Greek yogurt in one sitting." →「一度にヨーグルト 6.5 食分」 | Samsung Food 2025-11-22 [1]／Eat This Much 2026-05-08 [4] |
| 地域・文化（米国データでは低、他地域は未確認） | "what White Americans think Mediterranean food is." →「地中海食プランが“白人アメリカ人の想像する地中海料理”」。Samsung Food は 2023 年に対応国を縮小。デンマークの食品に弱いという声も | eMeals 2026-10-18 [9]／[18]／Bitepal 2026-10-27 [17] |
| プライバシー（低頻度だが離脱に直結） | "scrubs your phones contacts and bombards your email" →「連絡先を吸い上げてメールを大量送信」。NYT では「AI チャットは学習に使われる」との声（未検証） | Samsung Food 2026-10-25 [1]／[5] |
| 改悪・外部依存 | "Whisk was a better app and y'all ruined it when you bought it." →「買収で台無しになった」。AnyList ではユーザー報告によると、Amazon 側の仕様変更で Alexa 連携が不安定になった | Samsung Food 2024-06-24 [1]／AnyList 2026-03-23 [3] |

## 2. AI 生成レシピ・AI 献立への批判と研究

### 2-1. 事件と批判

| 時期 | 事例 | 内容 | 教訓 |
|---|---|---|---|
| 2023-05〜 | Tasty「Botatouille」[21][22] | ChatGPT API の対話型レシピ推薦。ユーザーからは「豆なしで頼んだのに "instead of beans this recipe has black beans"」「糖尿病でケトを頼んだら 1 日の糖質上限を超えた」「検索のほうがまし」という声[6]。2026-10 時点でもアプリ説明に掲載されている | 否定条件や数値条件の取り違えは信頼を削る |
| 2023-08 | Pak'nSave「Savey Meal-bot」（NZ）[20] | 2023-06 開始。水・アンモニア・漂白剤から有毒ガスが出る "Aromatic Water Mix" などを生成（生成総数は 3.5 万件超）。会社は「不適切な利用」と説明し、注意書きは「人間はレビューしていない」 | 入力の制限と出力の安全検査は必須。注意書きではブランドを守れない |
| 2023-09 | Amazon の AI 生成とみられるキノコ本・料理本[23] | ニューヨーク菌類学会が警告した | 食の安全情報で「未検証の AI 生成」は致命的 |
| 2025-11-26 | Fortune／Bloomberg、クリエイター 22 人を取材[24] | 検索流入が 30〜80% 減った。AI が合成したケーキは 6 インチを 160℃で 3〜4 時間（作者いわく「炭になる」）。"Frankenstein AI recipes" と命名された。Google は「出発点として役立つ」と回答 | 合成レシピは「誰もテストしていないレシピ」になる |
| 2025-12-15 | The Guardian（Futurism 経由）[25] | AI Mode が 10 のソース（ギリシャ風を含む）からミートボールを合成した。"extinction event" という発言も。過去の「ピザに糊」誤答にも言及（時期は未確認） | 出典の帰属と同一性を保つ |
| 2026-02 | Inspired Taste の検証[26] | 「彼らの」キーライムパイと称する AI 版は、練乳 2 缶（原典は 1 缶）で、生クリーム・ライムの皮・砂糖が欠落し、検索のたびに中身が変わった | 原典を名乗る改変は信頼を壊す |
| 2026-10 | NYT Cooking の AI 機能[5] | レビューから「ADJUST THIS RECIPE／SUBSTITUTE AN INGREDIENT」というボタンの追加と読み取れる（公式発表は未確認）。"An AI agent cannot taste, touch, smell or see." | 有料の人間編集ブランドでは AI はオプトインに |

補足：CNN の「AI 製とみられるレシピで失敗した」体験記事（2025-12）は二次情報のみ[27]。

### 2-2. 研究（2023〜2026）

| 研究 | 方法 | 主な結果 |
|---|---|---|
| Niszczota ほか, *Nutrition* 2023-05 [29] | ChatGPT でアレルギー向けの献立 56 件 | 56 件中 4 件（7.1%）に禁止アレルゲン（ナッツ除去食にアーモンドミルク）。最も多い誤りは分量とカロリー |
| Hieronimus ほか, *Nutr Res* 2024-07 [30] | ChatGPT と Bard で 108 献立 | エネルギー・炭水化物が不足し、たんぱく質は過多。ビタミン D とフッ素は全献立で不足、ビーガンでは B12 も不足 |
| Kaya Kaçar ほか, *Nutrients* 2025-01 [31] | 3 つのチャットボットで減量献立 | 食事の質は良好だが栄養バランスが最弱。Gemini は半数超が目標 kcal から ±20% 超ずれた |
| Bilen ほか, *Front Nutr* 2026-03 [33] | 5 モデル（GPT-4o、Gemini 2.5、Claude 4.1 など）で思春期向け 60 献立 | 栄養士案よりエネルギーが約 695kcal 少ない。脂質は 41–45%E、炭水化物は 32–36%E |
| Bayram ほか 2025-03 [32]／Aydin Cil ほか *BMC Nephrol* 2026-01 [34] | 肥満食・腎臓病食 | 指示より低カロリーで、カルシウム・カリウムが不足。腎臓病食は 859〜1,496kcal で、一部はカリウムが安全上限を超え、言語で質が変わった。ガイドラインへの完全準拠はゼロ |
| Hsuan ほか, *Nutrients* 2025-09 [35] | 弁当の栄養推定 | 熱量と三大栄養素の精度は 70〜90%。ナトリウムは全モデルで過小 |
| O'Hara ほか, *Nutrients* 2025-02 [36] | 食事写真 114 枚 | 食品の識別は 93% 正確だが、中・大盛りの重量推定が不良。16 栄養素中 13 で誤差 10% 超 |
| Martin-Hadmaș ほか, *Nutrients* 2026-09 [37] | 小児の献立評価 | AI のエネルギー誤差が最大（260kcal。専門職は 148kcal）。定性評価では AI が最良 |
| NutriBench, ICLR 2025 [38] | 食事記述 11,857 件 | 文章からの炭水化物推定では栄養士を上回る場合もあった（肯定的） |
| FoodGuardBench, arXiv 2026 [39] | 食品安全に関する有害な質問と、脱獄による変種 | 12 モデルの平均攻撃成功率は 25.5%。汎用ガードレールの検出精度は 55.8% で、専用モデルは 97.6% |
| CARE 2026-05 [40]／NutriSteppe-AI 2026-07 [41] | LLM に栄養 DB・知識グラフ・ルール検証・線形計画を併用 | 制約充足率は 85.0%、検証ありで 98.5%（CARE）。NutriSteppe は 96.8% で、数値の幻覚ゼロ。NutriGen は目標 kcal との誤差 1.55〜3.68% を報告[42] |

**まとめ**：素の LLM は、もっともらしいが数値（エネルギー、微量栄養素、ナトリウム）がずれ、除外食材の指定は数 % 単位で漏れ、モデル・言語・試行で結果が変わる。数値は栄養 DB で、制約はルール検証で担保し、LLM は対話と選択を担う。この分業で精度は大きく上がる。ただし多くは小規模・旧モデルの研究である。

## 3. 失敗事例と教訓

| 時期 | 事例 | 何が起きたか／理由 | 教訓 |
|---|---|---|---|
| 2023-03-20 | Allrecipes アプリ終了[45] | 3/6 に告知し、Web に集中。運営元の People Inc. は 2026-08-27 に保存特化アプリ「MyRecipes」を出し、有料版で広告なし・Instagram／TikTok 保存を提供[46] | 主戦場は「SNS 由来レシピの保存」へ移った |
| 2023-08-30 | Whisk → Samsung Food [18][19] | 2019 年に買収、2023 年に改名。2024-09 に Samsung Food+（月約 7 ドル、南ア価格から換算）。以後のレビューは「Whisk 時代のほうが良かった」「全画面広告」「同期不良」[1] | 収益化が調理中の閲覧体験を壊すと離反を招く |
| 2023-09／11 | Blue Apron → Wonder [53][54] | 約 1.03 億ドルで売却。2022 年度の純損失は 1.097 億ドル、2023 年 Q2 の売上は 14% 減 | 定期便は解約されやすく、物流の負担も重い |
| 2024-04／2024-12-20 | Yummly（Whirlpool。2017 年買収）[28][43][44] | 担当チームを全員解雇した後に終了した。エクスポートは限定的だったとの報告がある（未精査）。理由は「運営モデルの調整」。「15 年使ったのに突然終わった」という声も[13] | 親会社の本業の都合で消え、ユーザーはデータを失う |
| 2025（**未確認**） | PlateJoy（RVO Health） | 競合ブログによれば 2025-07-01 に終了[52]。一次発表は確認できず | ― |
| 2025 | HelloFresh [55] | Q3 の売上は為替影響を除いて 9.3% 減、注文数は 12.9% 減。「獲得数より顧客の質」へ転換 | 割引で獲得した顧客は定着しない |
| 2026-10-21 | Mealime（Albertsons）[47][48] | Albertsons アプリ内の Meals Hub へ移行。個人データは削除され、エクスポートの案内はなし。移行先探しの低評価が他アプリに続出（「食料品チェーンに身売りした」[8]、「Mealime の代わりにならない」[1][9]） | 小売に買われた献立アプリは EC 導線に吸収される。持ち出せないことへの反感は強い |
| 2026-11-06 | Ollie（AI 献立 → 家族向け AI アシスタント）[16][49][50][51] | 2025-08 時点で 5 万家族超が利用、月 9.99 ドル。2026-09 に 750 万ドルを調達したが、10/30 に閉鎖を発表。CEO は "We got close, but ultimately couldn't keep up."（あと一歩だったが追いつけなかった）とし、競合する AI アシスタント（Muse、Instinct など）の参入で目立つことも資金調達も難しくなったと説明。返金とデータ送付で対応 | AI 献立単体は、より広い AI アシスタントに飲み込まれやすい |
| 2026-10〜11 | NYT Cooking の AI 機能[5]／Paprika 4 のサブスク化[2] | 低評価率が 9%→34% に上昇／古参ユーザーが「機能を取り上げられた」と反発 | 既存のファンへの体験変更は慎重に |

## 4. なぜ meal planning アプリは続かないのか

### 4-1. データ

| 指標 | 値 | 出典 |
|---|---|---|
| 健康アプリの利用をやめた経験 | ダウンロード経験者の 45.7%。主な理由は入力負担、興味の喪失、隠れた費用 | 米国 1,604 人、2015 [56] |
| アプリ介入の脱落率 | 統合値 43% | メタ分析、2020 [57] |
| （参考）メンタルヘルスアプリの 30 日継続率 | 中央値 3.3% | 2019 [58] |
| サブスクの 1 年継続率（全カテゴリ） | 年額 44.1%、月額 17.0%。年額プランの約 30% が初月に解約 | RevenueCat 2025 [59] |
| Health & Fitness | 返金率 4.71%（全カテゴリで 2 番目に高い）、ダウンロードから有料（35 日以内）は中央値 2.9% | RevenueCat 2025／2026 [59][60] |
| AI 搭載アプリ | 課金者あたり収益は 41% 多いが、解約は 30% 速い | RevenueCat 2026 [60] |

Food & Drink カテゴリ固有の継続率ベンチマークは取得できず、未確認。

### 4-2. 構造的な理由

1. **入力負担が価値を上回る**：在庫・好み・家族の制約の登録が重い[2][11][56]。
2. **計画と生活がずれる**：在庫・セール・残り物・予定変更を無視した静的な計画は破綻する[1][4]。
3. **飽きる**：数週間で献立が繰り返し始める[4][9][16]。
4. **家族の合意形成とメンタルロード**：好みの統合、共有の同期失敗、管理役の偏りが残る[1][16]。
5. **価値を感じる前の課金壁**：入力 → ペイウォール → 強制トライアルで初日に離脱する。
6. **信頼は一撃で失われる**：アレルゲン無視、栄養ミス、データ消失。
7. **汎用 AI によるコモディティ化**：「ChatGPT なら無料」という比較[8][9]、AI アシスタント同士の競争による Ollie の閉鎖、AI アプリの速い解約[49][60]。
8. **プラットフォーム依存**：Alexa の仕様変更や、買収後の改悪[1][3]。

### 4-3. 「理想の献立アプリ」論

- **Product Hunt の作り手**（2026 年初頭）：「料理より“何を作るか”の計画が面倒」「レシピも買い物リストも計画もバラバラ」[61]。失敗要因は「時間・飽き・偏食・買い物の摩擦」との仮説もある[62]。いずれも返信はなく、根拠は弱い。
- **Plan to Eat**（自社ブログ）：小さなステップと「出発点」が鍵[63]。
- **レビューからの要望**：①週の計画と買い物リストまで無料、②在庫・残り物・セールへの対応、③家族の制約の厳守、④忠実な取り込み、⑤調理画面に広告を出さない、⑥ AI は任意、⑦エクスポート。
- Hacker News と Reddit は未確認。

## 企画への示唆

1. **課金で信頼を得る**：「週の献立 → 買い物リスト」は無料で完結させる。強制トライアル、価格の後出し、解約後の請求、既存機能の有料化は避ける。価格は最初に明示し、更新前に通知し、即時解約と日割り返金に応じる。
2. **LLM に数値と安全を任せない**：栄養は決定論的な DB で計算する。アレルギーや除外食材は、生成後にルールで全件検証して違反ゼロを KPI にし、食品でない入力は遮断する（検証層の追加で制約充足率は 85%→98.5%）。
3. **レシピの原典性を守る**：AI は「人がテストしたレシピの選択・調整・説明」に使う。改変は差分と出典で示し、取り込み時には原文を変えない。
4. **AI はオプトインで、いつでも戻せる形に**：既定でオフにするかワンタップで無効化でき、学習への利用は明示する（NYT Cooking の教訓）。
5. **買い物リストを正確にする**：同じ食材の集約、単位換算、在庫の差し引き、パック単位への丸めを決定論的に行い、勝手な追加はしない。
6. **入力ほぼゼロの導入**：1〜3 問で今週の献立を出し、在庫は写真・レシート・音声で更新し、好みは使いながら学習する。
7. **再計画を中核機能に**：残り物、予定変更、セールに合わせて即座に組み替える。多様性の制約を設けつつ、定番は固定できるようにする。
8. **世帯単位で設計する**：複数人の制約を統合し、確実な同期と分担で管理役の負担を増やさない。
9. **データの持ち出しを約束する**：常時エクスポートでき、終了時の移行を保証すると明文化する。調理画面に広告は出さない。
10. **汎用 AI との差別化は「文脈と実行」で**：在庫、家族の履歴、地域の店と価格、調理の実績という継続データと、買い物から調理までの実行で価値を出す。

## 出典一覧

（App Store の各ページと、RSS で取得したレビューは 2026-11-08 に取得した。）

1. Samsung Food（App Store）https://apps.apple.com/us/app/id1133637674
2. Paprika Recipe Manager 4（App Store。v4.0.17 の説明文、2026-11-06）https://apps.apple.com/us/app/id1303222868
3. AnyList（App Store）https://apps.apple.com/us/app/id522167641
4. Eat This Much（App Store）https://apps.apple.com/us/app/id981637806
5. NYT Cooking（App Store）https://apps.apple.com/us/app/id911422904
6. Tasty（App Store。説明文に「AI Botatouille: Powered by ChatGPT API」、v3.41 2026-10-08）https://apps.apple.com/us/app/id1217456898
7. ReciMe（App Store）https://apps.apple.com/us/app/id1593779280
8. MealPrepPro（App Store）https://apps.apple.com/us/app/id1249805978
9. eMeals（App Store）https://apps.apple.com/us/app/id575756462
10. Prepear（App Store）https://apps.apple.com/us/app/id1248495163
11. ChefGPT: AI Calories Tracker（App Store）https://apps.apple.com/us/app/id6449961549
12. Plan to Eat（App Store）https://apps.apple.com/us/app/id1215348056
13. Cookpad（App Store。2025-09-09 のレビュー）https://apps.apple.com/us/app/id585332633
14. App Store レビュー RSS（取得形式）https://itunes.apple.com/us/rss/customerreviews/page=1/id={appID}/sortby=mostrecent/json
15. Unstar、2026-05-01（分析ツール販売企業）https://unstar.app/blog/allrecipes-yummly-nyt-cooking-paprika-mealime-recipe-apps-ranked-2026
16. Washington Post（Inquirer 転載）2025-08-28 https://www.inquirer.com/food/ai-apps-meal-planning-shopping-20250828.html
17. Bitepal（Trustpilot、2026-10-27 のレビュー）https://ie.trustpilot.com/review/bitepal.app
18. 9to5Google、2023-08-30 https://9to5google.com/2023/08/30/whisk-samsung-food-app-rebrand/
19. Stuff（南ア）、2024-09-06 https://stuff.co.za/2024/09/06/samsung-food-upgraded-ai-app-pay-for/
20. Gizmodo、2023-08-10 https://gizmodo.com/paknsave-ai-savey-recipe-bot-chlorine-gas-1850725057
21. Futurism、2023-05-25 https://futurism.com/the-byte/buzzfeed-ai-recipe-laid-off-journalists
22. BuzzFeed プレスリリース、2023-05-23 https://www.buzzfeed.com/buzzfeedpress/buzzfeeds-tasty-introduces-botatouille-the-first-of-its
23. Fortune、2023-09-03 https://fortune.com/2023/09/03/ai-written-mushroom-hunting-guides-sold-on-amazon-potentially-deadly/
24. Fortune／Bloomberg、2025-11-26 https://fortune.com/2025/11/26/ai-slop-recipes-thanksgiving-food-blog-collapse-traffic
25. Futurism（The Guardian 2025-12-15 を引用）2025-12-19 https://futurism.com/artificial-intelligence/google-ai-summaries-destroying-recipe-developers （原文 https://www.theguardian.com/technology/2025/dec/15/google-ai-recipes-food-bloggers は取得不可）
26. PPC Land、2026-02-14 https://ppc.land/recipe-creators-prove-googles-ai-generates-dangerous-frankenstein-dishes/
27. Let's Data Science、2026-07-02 https://letsdatascience.com/news/ai-recipes-erode-public-trust-in-online-cooking-content-73091dee
28. The Spoon、2024-04-03 https://thespoon.tech/whirlpool-lays-off-entire-team-for-cooking-and-recipe-app-yummly/
29. Niszczota & Rybicka, *Nutrition* 2023-05-11 https://doi.org/10.1016/j.nut.2023.112076 ／Fox News 2023-05-17（4/56 件）https://www.foxnews.com/health/chatgpt-meal-planning-food-allergies-study-measured-robo-diet-safety-experts-warnings
30. Hieronimus ほか, *Nutrition Research* 2024-07-14 https://doi.org/10.1016/j.nutres.2024.07.002
31. Kaya Kaçar ほか, *Nutrients* 2025-01-07 https://doi.org/10.3390/nu17020206
32. Bayram ほか, *Nutrition and Health* 2025-03-20 https://pubmed.ncbi.nlm.nih.gov/40111941/
33. Bilen ほか, *Frontiers in Nutrition* 2026-03-12 https://doi.org/10.3389/fnut.2026.1765598
34. Aydin Cil ほか, *BMC Nephrology* 2026-01-28 https://doi.org/10.1186/s12882-026-04764-w
35. Hsuan ほか, *Nutrients* 2025-09-24 https://doi.org/10.3390/nu17193044
36. O'Hara ほか, *Nutrients* 2025-02-07 https://doi.org/10.3390/nu17040607
37. Martin-Hadmaș ほか, *Nutrients* 2026-09-21 https://doi.org/10.3390/nu18183106
38. NutriBench（ICLR 2025）arXiv:2407.12843（v6 2026-03）https://arxiv.org/abs/2407.12843
39. FoodGuardBench, arXiv:2604.01444（2026-04-01、v3 2026-10-13）https://arxiv.org/abs/2604.01444
40. CARE, *Foods* 2026-05-09 https://doi.org/10.3390/foods15101647
41. NutriSteppe-AI, *Nutrients* 2026-07-09 https://doi.org/10.3390/nu18142228
42. （参考）NutriGen, arXiv:2502.20601、2025-02-28 https://arxiv.org/abs/2502.20601
43. Plan to Eat「Yummly is closing」2024-12-02（競合企業の記事）https://www.plantoeat.com/blog/2024/12/yummly-is-closing-discover-the-best-meal-planning-alternative/
44. TechCrunch、2017-05-04 https://techcrunch.com/2017/05/04/whirlpool-acquires-yummly-the-recipe-search-engine-last-valued-at-100m/
45. PiunikaWeb、2023-05-03（2023-10-09 更新）https://piunikaweb.com/2023/08/28/allrecipes-app-not-working-or-discontinued-heres-what-we-know/
46. MyRecipes（App Store、2026-08-27 公開）https://apps.apple.com/us/app/id6755009073
47. Mealime 閉鎖告知（2026-11-08 取得）https://www.mealime.com/closing
48. Ultimate Meal Plans、2026-11-06 更新（競合企業の記事）https://ultimatemealplans.com/reviews/mealime
49. TechCrunch、2026-10-30 https://techcrunch.com/2026/10/30/ollie-a-privacy-focused-ai-assistant-is-shutting-down/
50. Ollie Farewell（2026 年）https://ollie.ai/farewell
51. Carly、2026-10-30（競合企業の記事）https://www.usecarly.com/blog/ollie-ai-shutting-down/
52. HowIEatHealthy、2026-03-27（競合企業の記事、出典記載なし）https://howieathealthy-website.vercel.app/blog/platejoy-alternative-2026
53. just-food、2023-10-02 https://www.just-food.com/news/blue-apron-sells-loss-making-us-meal-kit-business-to-wonder-group/
54. Restaurant Business、2023-11（日付は未確認）https://www.restaurantbusinessonline.com/financing/wonder-completes-acquisition-blue-apron-103m
55. HelloFresh Q3 2025 プレスリリース、2025-10-30 https://www.placera.se/pressmeddelanden/hellofresh-hellofresh-se-delivers-robust-efficiency-gains-and-strong-ytd-cash-flow-in-q3-2025-accelerates-product-investment-strategy-20251030
56. Krebs & Duncan, *JMIR mHealth uHealth* 2015-11-04 https://doi.org/10.2196/mhealth.4924
57. Meyerowitz-Katz ほか, *JMIR* 2020-09-29 https://doi.org/10.2196/20283
58. Baumel ほか, *JMIR* 2019-09-25 https://doi.org/10.2196/14567
59. RevenueCat「State of Subscription Apps 2025」 https://www.revenuecat.com/state-of-subscription-apps-2025/
60. RevenueCat「State of Subscription Apps 2026」（2025 年データ） https://www.revenuecat.com/state-of-subscription-apps-2026/
61. Product Hunt（2026 年初頭）https://www.producthunt.com/p/self-promotion/why-is-meal-planning-still-so-hard-in-2026
62. Product Hunt（CookifyAI）https://www.producthunt.com/p/cookifyai/what-usually-causes-meal-planning-apps-to-fail-after-the-first-few-weeks
63. Plan to Eat、2026-05-28（自社ブログ）https://www.plantoeat.com/blog/2026/05/whats-the-best-app-for-overwhelmed-meal-planners/

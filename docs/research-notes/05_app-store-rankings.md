# 献立アプリ企画：App Store ランキング調査（2026-11-08 時点）

## 0. 取得方法と前提

- **取得元**：App Store の公開RSS（旧 iTunes RSS、JSON形式、上位100件）。`{cc}` は jp / us / kr / fr / de
  - フード／ドリンク（genre=6023）無料：`https://itunes.apple.com/{cc}/rss/topfreeapplications/limit=100/genre=6023/json`
  - フード／ドリンク（genre=6023）売上（トップセールス）：`https://itunes.apple.com/{cc}/rss/topgrossingapplications/limit=100/genre=6023/json`
  - ヘルスケア／フィットネス（genre=6013）：日本・米国の売上（参考として無料も取得）
- **取得日時**：2026-11-08 16:07:21〜16:07:31 UTC（米国太平洋時間 11-08 08:07、日本時間 11-09 01:07）。14本のフィードはすべて HTTP 200・各100件。各フィードの `updated` は 2026-11-08T08:06〜08:07-07:00 で、取得時刻とほぼ同じだった。
- **サブタイトル**：`https://apps.apple.com/{cc}/app/id{アプリID}` の製品ページから取得した（2026-11-08 16:18〜16:20 UTC、各国の言語で取得）。現地語のサブタイトルがないページはカテゴリ名だけが表示されるため、その場合は `?l=en-US` で取得した英語版のサブタイトルを使った。
- **提供有無と評価件数**：iTunes Lookup API `https://itunes.apple.com/lookup?id=…&country=jp|us` で確認した（2026-11-08 16:23〜16:25 UTC）。
- **分類**：アプリ名・開発元・説明文をもとに手作業で分類した。
  - **対象（順位表に載せる）**
    - レシピ：メディア・動画・雑誌、調理家電連携、プロ向け、離乳食・幼児食
    - レシピ保存・管理：SNSやWebからの取込を含む
    - 献立・食事計画：買い物リストを含む
    - 食材・在庫管理
    - 栄養・カロリー・食事制限：食品スキャン、アレルギー・不耐症、妊娠中の食事
    - 食事記録
    - AI料理アシスタント
  - **件数だけ数える**
    - 宅配・デリバリー・注文プラットフォーム：ミールキット、ネットスーパー、宅配水を含む
    - 外食チェーン：カフェ、ベーカリー、スイーツ店を含む
    - 小売・ポイント・EC：スーパー、コンビニ、酒販、自販機、産直EC
    - グルメ検索・予約・外食記録
    - 酒・飲料：ワイン、ビール、コーヒー、カクテルレシピ
    - その他：フードロス、ハラール、業務用ツール、ライブ配信など
- **AI表記の判定**：アプリ名（RSSの現地名）とサブタイトルに次の語があるかを機械的に判定した。
  - 対象語：「AI」「IA（仏）」「KI（独）」「ＡＩ」「GPT」など
  - 判定区分：「名前」「サブ」「名前・サブ」のいずれかで記録する
  - 「説明冒頭」：名前・サブタイトルにはなく、説明文の先頭300字以内にだけ出てくる場合
- **注意点**
  - 売上ランキングは App Store 経由の課金（アプリ内課金・有料DL）に基づく。決済をアプリの外で行う宅配・外食・小売アプリは、売上ランキングにはほとんど出てこない。
  - カテゴリ別ランキングはプライマリカテゴリで集計される。あすけん・カロミル・Cal AI・MyFitnessPal などはプライマリがヘルスケア／フィットネスなので、フード／ドリンクのランキングには出てこない。Lookup のジャンルにはフード／ドリンクを併記しているものがある。
  - 旧RSSの順位は、App Store アプリ内の表示と時間差や差異が出ることがある。

## 1. 件数サマリー（フード／ドリンク 上位100）

### 1-1 カテゴリ別件数と対象アプリの最高順位

| 国 | チャート | 対象（レシピ等） | 宅配・デリバリー | 外食チェーン | 小売・ポイント・EC | グルメ検索・予約・外食記録 | 酒・飲料 | その他 | 対象の最高順位 | 対象のTOP10入り |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|
| 日本 | 無料 | 5 | 6 | 79 | 5 | 4 | 0 | 1 | 57位 デリッシュキッチン | 0 |
| 日本 | 売上 | 54 | 0 | 0 | 0 | 16 | 22 | 8 | 1位 クックパッド | 6 |
| 米国 | 無料 | 6 | 14 | 64 | 9 | 6 | 0 | 1 | 11位 ReciMe | 0 |
| 米国 | 売上 | 76 | 0 | 0 | 3 | 7 | 13 | 1 | 1位 ReciMe | 8 |
| 韓国 | 無料 | 4 | 12 | 62 | 6 | 11 | 3 | 2 | 30位 해먹으리 | 0 |
| 韓国 | 売上 | 56 | 0 | 0 | 0 | 2 | 38 | 4 | 1位 Gronda | 6 |
| フランス | 無料 | 32 | 18 | 27 | 7 | 6 | 7 | 3 | 4位 Yuma | 2 |
| フランス | 売上 | 81 | 0 | 0 | 0 | 0 | 17 | 2 | 1位 Thermomix Cookidoo | 8 |
| ドイツ | 無料 | 29 | 23 | 20 | 14 | 6 | 5 | 3 | 2位 mise | 2 |
| ドイツ | 売上 | 83 | 0 | 0 | 0 | 3 | 13 | 1 | 1位 Thermomix Cookidoo | 10 |

取得元：`https://itunes.apple.com/{jp,us,kr,fr,de}/rss/topfreeapplications/limit=100/genre=6023/json` と `https://itunes.apple.com/{jp,us,kr,fr,de}/rss/topgrossingapplications/limit=100/genre=6023/json`。取得日時：2026-11-08 16:07:21〜16:07:28 UTC。

- ミールキットは「宅配」に計上した。HelloFresh（仏 無料21位・独 無料37位）、Quitoque（仏 無料77位）、윙잇（韓 無料87位）が該当し、いずれも無料チャート。日本と米国の上位100には見当たらなかった。
- 日本の無料チャートは外食チェーンの公式アプリが79件を占める（寿司・牛丼・ラーメン・ファミレスなど）。韓国の売上チャートは酒・飲料系（ワイン・コーヒー・カクテル）が38件と多い。
- 米国の売上5位 Localize（農家直販のマーケット）と21位 Farm To Table は「小売・ポイント・EC」に計上した。

### 1-2 対象アプリの内訳とAI表記数

| 国 | チャート | レシピ系 | うち家電連携 | 保存・管理 | 献立・食事計画 | 食材・在庫 | 栄養・食事記録 | AIアシスタント | 計 | AIを名前/サブに表記 | 説明冒頭のみAI |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 日本 | 無料 | 4 | 0 | 1 | 0 | 0 | 0 | 0 | 5 | 0 | 0 |
| 日本 | 売上 | 20 | 0 | 18 | 8 | 1 | 6 | 1 | 54 | 10 | 1 |
| 米国 | 無料 | 1 | 0 | 3 | 2 | 0 | 0 | 0 | 6 | 0 | 0 |
| 米国 | 売上 | 25 | 2 | 23 | 19 | 1 | 5 | 3 | 76 | 5 | 3 |
| 韓国 | 無料 | 2 | 0 | 1 | 0 | 0 | 1 | 0 | 4 | 1 | 2 |
| 韓国 | 売上 | 36 | 1 | 11 | 4 | 2 | 2 | 1 | 56 | 3 | 3 |
| フランス | 無料 | 12 | 5 | 8 | 8 | 1 | 2 | 1 | 32 | 1 | 0 |
| フランス | 売上 | 28 | 2 | 25 | 17 | 2 | 7 | 2 | 81 | 5 | 5 |
| ドイツ | 無料 | 14 | 5 | 7 | 6 | 0 | 2 | 0 | 29 | 1 | 1 |
| ドイツ | 売上 | 35 | 3 | 21 | 13 | 5 | 8 | 1 | 83 | 7 | 2 |

取得元：1-1 と同じRSS、およびサブタイトル取得元 `https://apps.apple.com/{cc}/app/id{ID}`。取得日時：RSS 2026-11-08 16:07:21〜16:07:28 UTC、製品ページ 16:18〜16:20 UTC。
※「レシピ系」はレシピ・家電連携・プロ向け・離乳食の合計で、「栄養・食事記録」は栄養・カロリー・食事制限と食事記録の合計。

## 2. 国別順位表（対象アプリ、フード／ドリンク）

凡例：「－」はその国のそのチャートで上位100の圏外。並びは無料・売上のうち良いほうの順位。AI表記は名前またはサブタイトルにAI系の語があるか（「説明冒頭」は説明文の先頭300字だけに出てくる、「－」はどこにもない）。

### 2-1 日本（JP）：対象アプリ 54件

| 無料 | 売上 | アプリ名 | 種別 | AI表記 |
|---:|---:|---|---|---|
| 63 | 1 | レシピはクックパッド -No1節約料理や献立の検索アプリ | レシピ投稿・検索・献立 | － |
| 95 | 3 | クラシル - 毎日の献立に！レシピ動画で料理がおいしく作れる | レシピ動画・献立 | － |
| 57 | 4 | レシピ動画で料理献立を簡単に - デリッシュキッチン | レシピ動画・献立 | － |
| 93 | 5 | ナディア-プロの料理家のレシピで毎日の献立がすぐ決まる | プロ料理家レシピ・献立 | － |
| 90 | 7 | CookGo：食事の計画とレシピの保存 | レシピ取込・保存＋食事計画 | － |
| － | 10 | レシピ記録・レシピ管理アプリ クックスルー | レシピ記録・管理 | － |
| － | 11 | リュウジのバズレシピ | 料理研究家レシピ | － |
| － | 12 | 土井善晴の和食 - 旬の献立をレシピ動画で紹介 - | 料理研究家レシピ動画・旬の献立 | － |
| － | 13 | レシピ記録・献立作成・買い物リスト管理 - レピッタ | レシピ記録・献立作成・買い物リスト | サブ |
| － | 15 | 献立記録カレンダー 食事記録&レシピ記録 | 献立記録・食事記録カレンダー | － |
| － | 20 | 料理レシピ記録・献立カレンダー・買い物リスト: ReciMe | レシピ保存・献立・買い物リスト | － |
| － | 21 | E・レシピ ‐ プロの献立レシピを毎日お届け | プロの献立レシピ配信 | － |
| － | 22 | Eatr: 食事管理·ダイエット健康レシピ&カロリー記録 | パーソナライズレシピ提案・食事管理 | － |
| － | 23 | mogmee(モグミー) - レシピ・献立・カロリー計算 | SNSレシピ取込・献立・カロリー | サブ |
| － | 26 | 賞味期限・在庫管理のリミッター(Limiter) | 賞味期限・在庫管理 | － |
| － | 27 | レシパル - 毎日のレシピ記録・献立作成ができるレシピ帳 | レシピ帳・献立作成 | － |
| － | 28 | レピモ｜レシピ管理・献立表＆買い物リスト | レシピ管理・献立表・買い物リスト | サブ |
| － | 29 | mogumogu — 食事を可愛くステッカー日記に | 食事日記（ステッカー） | サブ |
| － | 30 | 月刊専門料理 | 料理専門誌（プロ向け） | － |
| － | 31 | Noms - 食事日記 & 記録 | 食事日記 | サブ |
| － | 32 | NYT Cooking: Quick Tasty Meals | レシピメディア（NYT） | － |
| － | 33 | タニタ社員食堂レシピ | ヘルシーレシピ（タニタ） | － |
| － | 35 | Gronda: Recipes for Chefs | シェフ向けレシピ | － |
| － | 36 | meek - 献立表・カレンダー・共有 | 献立表・カレンダー共有 | － |
| － | 37 | Mob: Meal Planner and Recipes | 献立・レシピ | － |
| － | 40 | MealPrepPro Planner & Recipes | 作り置き献立・レシピ | － |
| － | 42 | パティレコ - 洋菓子レシピ・栄養成分表示ラベル作成 | 菓子レシピ管理・栄養成分表示 | － |
| － | 47 | 妊娠中の食事：食品とレシピ | 妊娠中の食品可否・レシピ | － |
| － | 48 | Disha: 節約献立と自炊・食費管理 | 予算内の週間献立・食費管理 | サブ |
| － | 53 | ごはんメモ - 食事日記/ごはん記録/ごはん日記/食べ物記録 | 食事日記 | － |
| － | 55 | 料理ノート - 献立・レシピの記録や料理日記に | 献立・レシピ記録（料理日記） | － |
| － | 56 | CibouScan - 食品と美容 | 食品スキャン（栄養スコア） | － |
| － | 57 | Cuisinez pour bébé | 離乳食レシピ | － |
| － | 59 | C-Cook:ノンフライヤーの温度・時間設定管理アプリ | ノンフライヤー設定管理（調理補助） | － |
| － | 61 | Recipe Keeper | レシピ保存・管理 | － |
| － | 62 | マグネットレシピ ／ あらゆるレシピを保存する | レシピ保存 | サブ |
| － | 63 | レシピを検索し管理するREPICI | レシピ検索・管理 | － |
| － | 64 | レシピ保存・管理・記録・メモアプリなら -レピレピ | レシピ保存・管理 | － |
| － | 65 | こどもレシピ - 離乳食・幼児食の献立サポート | 離乳食・幼児食の献立 | － |
| － | 66 | Pam Fitness & Food | ヘルシーレシピ（Pamela Reif） | － |
| － | 67 | Fou de Pâtisserie | 製菓雑誌 | － |
| － | 69 | MOGLIA（もぐりあ） | AI献立提案・レシピ・買い物 | サブ |
| － | 71 | Bon Appétit: Recipes & Cooking | レシピメディア（Bon Appétit） | － |
| － | 76 | café-sweets（カフェ・スイーツ） | カフェ・製菓専門誌 | － |
| － | 77 | レシピ保存・管理 - レシピポケット | レシピ保存・管理 | － |
| － | 78 | Filipino Food Recipes & Dishes | フィリピン料理レシピ（有料） | － |
| － | 79 | KATSUYOレシピ ～小林カツ代の家庭料理～ | 料理研究家レシピ | － |
| － | 87 | 開運レシピ - 九星気学と薬膳で運気アップのAI献立 | AI献立（九星気学×薬膳） | 名前・サブ |
| － | 89 | AI予算献立 | AIが予算内で献立提案 | 名前 |
| － | 90 | 味憶APP | 家庭料理の記録 | － |
| － | 91 | Paprika レシピ・マネージャー４ | レシピ管理・献立 | － |
| － | 93 | レシピポケット レシピ管理＆翻訳 | レシピ管理・翻訳 | － |
| － | 94 | 和食マッスル - 筋トレ飯の献立作成とPFC管理 | 筋トレ向け献立・PFC管理 | － |
| － | 99 | Recify – SNS動画・レシピ動画保存と献立表整理 | SNS動画レシピ保存・献立表 | 説明冒頭 |

取得元：`https://itunes.apple.com/jp/rss/topfreeapplications/limit=100/genre=6023/json`（2026-11-08 16:07:21 UTC）、`https://itunes.apple.com/jp/rss/topgrossingapplications/limit=100/genre=6023/json`（2026-11-08 16:07:22 UTC）

### 2-2 米国（US）：対象アプリ 76件

| 無料 | 売上 | アプリ名 | 種別 | AI表記 |
|---:|---:|---|---|---|
| 11 | 1 | ReciMe: Recipes & Meal Planner | レシピ保存・献立・買い物リスト | － |
| 81 | 2 | NYT Cooking: Quick Tasty Meals | レシピメディア（NYT） | － |
| 31 | 3 | TapCook: Budget Meal Plans | 節約献立 | － |
| 66 | 4 | mise - meal planner | 献立・食事計画 | － |
| － | 6 | America's Test Kitchen | レシピメディア（ATK） | － |
| － | 7 | Whipp: Meal Planner & Recipes | 献立・レシピ | － |
| 70 | 8 | Osta: Save & Share Recipes | レシピ保存・共有 | － |
| － | 9 | Gronda: Recipes for Chefs | シェフ向けレシピ | － |
| － | 12 | eMeals - Healthy Meal Plans | ヘルシー献立 | － |
| － | 14 | Potto - meal planner | 献立 | － |
| － | 16 | NeatEat - Meal Planner | 献立 | － |
| － | 17 | Bon Appétit: Recipes & Cooking | レシピメディア（Bon Appétit） | － |
| 61 | 18 | MyRecipes | レシピ保存・管理 | － |
| － | 19 | Mob: Meal Planner and Recipes | 献立・レシピ | － |
| － | 22 | MealPrepPro Planner & Recipes | 作り置き献立・レシピ | － |
| － | 25 | RecipeBox - Save Your Recipes! | レシピ保存 | － |
| － | 28 | CookShelf: Search Cookbooks | 料理本検索 | － |
| － | 29 | Pepper - Recipe Organizer | レシピ管理（SNS型） | － |
| － | 31 | RecipeLab - Healthy Recipes | ヘルシーレシピ | － |
| － | 34 | Honeydew: Recipe & Cookbook AI | レシピ保存・料理本（AI） | 名前 |
| － | 35 | Recipe Keeper | レシピ保存・管理 | － |
| － | 36 | Delish: Original Fun Recipes | レシピメディア（Delish） | － |
| － | 37 | Deglaze: Recipe Manager | レシピ管理 | － |
| － | 38 | Cooklist: Pantry Meals Recipes | 手持ち食材からレシピ | － |
| － | 39 | Stashcook: Recipe Keeper | レシピ保存 | － |
| － | 40 | Plan to Eat | 献立・レシピ管理 | － |
| － | 41 | TGB: Meal Planner & Recipes | 献立・レシピ | － |
| － | 42 | Dishly Save & Cook Recipes | レシピ保存 | － |
| － | 43 | Chow: Meal Planner & Groceries | 献立・買い物 | － |
| － | 44 | Thermomix® Cookidoo® App | Thermomix公式レシピ | － |
| － | 45 | Recipe Keeper Box - OrganizEat | レシピ保存 | － |
| － | 46 | Bunlo: Meal Planner | 献立 | － |
| － | 47 | Anova Culinary | 低温調理器連携 | － |
| － | 48 | Zest: Meal Planner & Recipes | 献立・レシピ | － |
| － | 49 | Tastemade Cooking | レシピ動画（Tastemade） | － |
| － | 50 | Meal Planner: FoodiePrep AI | 献立（AI） | 名前 |
| － | 51 | Recipe Keeper: CookBook | レシピ管理 | － |
| － | 52 | Recipe Keeper - Cook'n | レシピ管理 | － |
| － | 53 | Flavorish ／ Save Any Recipe | レシピ保存 | － |
| － | 54 | The Doctor’s Kitchen | 健康レシピ（医師監修） | － |
| － | 55 | Scoolinary: Learn & Cook | 料理講座 | － |
| － | 56 | Inspo - Recipes & Meal Planner | レシピ保存・献立 | 説明冒頭 |
| － | 57 | BLW Meals: Starting Solids | 離乳食（BLW） | － |
| － | 58 | Pick Up Limes | 植物性レシピ・栄養 | － |
| － | 61 | Loaflo: Sourdough Starter | サワードウ管理（パン作り） | 説明冒頭 |
| － | 63 | Pestle: Recipe Manager | レシピ管理 | － |
| － | 64 | Vego: Vegan Meal Planner | ヴィーガン献立 | － |
| － | 66 | Just the Recipe: Cook smarter | Webレシピ抽出 | － |
| － | 67 | Daily Bite: Save Recipes | レシピ保存 | － |
| － | 68 | Tasty: Recipes, Cooking Videos | レシピ動画（Tasty） | － |
| － | 69 | 101 before one | 離乳食（101品目） | － |
| － | 72 | Cookpad Recipes | レシピ投稿・検索・献立 | － |
| － | 74 | Samsung Food: Meal Planner | 献立・レシピ保存（Samsung） | － |
| － | 75 | Recipe Keeper & Food Planner | レシピ保存・献立 | － |
| － | 76 | Crouton: Recipe Manager | レシピ管理 | － |
| － | 77 | Eatr: Tasty Cooking Recipes | パーソナライズレシピ提案・食事管理 | － |
| － | 78 | Ai System | AIレシピ・食事提案 | 名前 |
| － | 79 | Cookpanion: Recipes, Meal Plan | レシピ保存・献立 | 説明冒頭 |
| － | 80 | Annabel Karmel Kids Recipes | 幼児食レシピ | － |
| － | 82 | FoodGauge: Food Health Scanner | 食品健康スキャン | サブ |
| － | 83 | Pepperplate Cooking Planner | 献立・レシピ管理 | － |
| － | 84 | MyPlateGuard | 外食時のアレルギー対応 | － |
| － | 85 | Gluten Free Scanner: GF Foods | グルテンフリー食品スキャン | － |
| － | 86 | Allergy & Food Scanner: Nosher | アレルギー食品スキャン | － |
| － | 87 | BabyPlate: Starting Solids | 離乳食 | － |
| － | 89 | Guardian Feast: Daily Recipes | レシピメディア（Guardian） | － |
| － | 90 | WeeknightBite: Meal Planner | 平日夕食の献立 | － |
| － | 91 | RecipeSnap: Recipe Saver | レシピ保存 | － |
| － | 92 | foodByMaria: Greek Recipes | ギリシャ料理レシピ | － |
| － | 93 | FullyRaw by Kristina | ローフードレシピ | － |
| － | 94 | Read the Labels - Food Scanner | 食品ラベルスキャン | － |
| － | 95 | Umami - Recipe Manager | レシピ管理 | － |
| － | 96 | Love, Manuela | 製菓レシピ | － |
| － | 97 | Provecho | クリエイターレシピ（有料） | － |
| － | 98 | BakeWay: AI Baking Assistant | AI製菓アシスタント | 名前 |
| － | 99 | RecipeVault: Recipe Keeper | レシピ保存 | － |

取得元：`https://itunes.apple.com/us/rss/topfreeapplications/limit=100/genre=6023/json`（2026-11-08 16:07:23 UTC）、`https://itunes.apple.com/us/rss/topgrossingapplications/limit=100/genre=6023/json`（2026-11-08 16:07:23 UTC）

### 2-3 韓国（KR）：対象アプリ 58件

| 無料 | 売上 | アプリ名 | 種別 | AI表記 |
|---:|---:|---|---|---|
| － | 1 | Gronda: Recipes for Chefs | シェフ向けレシピ | － |
| － | 3 | 레시피 저장 & Meal Planner: ReciMe | レシピ保存・献立・買い物リスト | － |
| 30 | 5 | 해먹으리 - AI가 SNS 요리 영상을 레시피로! | SNS料理動画をAIでレシピ化 | 名前・サブ |
| － | 6 | NYT Cooking: Quick Tasty Meals | レシピメディア（NYT） | － |
| － | 8 | 냠냠쩝쩝 레시피북 - 유튜브 인스타 레시피 정리 | YouTube・Instaレシピ整理 | 説明冒頭 |
| － | 10 | Eatr: 식단 관리·다이어트 건강 레시피&칼로리 기록 | パーソナライズレシピ提案・食事管理 | － |
| － | 12 | クラシル - 毎日の献立に！レシピ動画で料理がおいしく作れる | レシピ動画・献立 | － |
| － | 13 | レシピはクックパッド -No1節約料理や献立の検索アプリ | レシピ投稿・検索・献立 | － |
| － | 16 | 빵일기장 - 베이킹,레시피,계산기 | ベーキング記録・レシピ | － |
| － | 17 | CookGo: 쉬운 레시피 가져오기 | レシピ取込・保存＋食事計画 | － |
| － | 20 | essen & trinken Magazin | 料理雑誌（独） | － |
| － | 22 | 냉장고 털기 : AI 재료 관리부터 냉장고 파먹기까지 | AI冷蔵庫在庫管理・使い切り | 名前 |
| － | 23 | 月刊専門料理 | 料理専門誌（プロ向け） | － |
| － | 24 | BLW Meals: Starting Solids | 離乳食（BLW） | － |
| － | 26 | 下厨房海外版-美食菜谱 | レシピ（下厨房・海外版） | － |
| － | 27 | Annabel Karmel Kids Recipes | 幼児食レシピ | － |
| － | 28 | Flavorish ／ Save Any Recipe | レシピ保存 | － |
| － | 33 | Baby Plates | 離乳食・幼児食 | － |
| － | 37 | Mob: Meal Planner and Recipes | 献立・レシピ | － |
| － | 38 | Cookpad: Recipe & Meal Planner | レシピ投稿・検索（Cookpad海外版） | － |
| － | 40 | Noms - 음식 다이어리 & 기록 | 食事日記 | サブ |
| － | 41 | 냠냠일기 - 아기 이유식 기록 | 離乳食記録 | － |
| － | 42 | Paprika Recipe Manager 4 | レシピ管理・献立 | － |
| － | 44 | Fou de Pâtisserie | 製菓雑誌 | － |
| － | 45 | BLW Brasil - Alimentação bebês | 離乳食（BLW） | － |
| － | 48 | 마이레시피 | SNSレシピ整理 | 説明冒頭 |
| － | 50 | 먹고 마시고 - 소소한 식단일기 | 食事日記 | － |
| － | 53 | 케토 다이어트 - 만개의 레시피 | ケトダイエットレシピ | － |
| － | 54 | 菜谱大全–小白学做菜做饭助手 | レシピ大全（中国語） | － |
| 86 | 55 | 요리백과 - 만개의 레시피 | レシピ（1万件） | － |
| － | 60 | Pam Fitness & Food | ヘルシーレシピ（Pamela Reif） | － |
| － | 61 | 懒饭 - 厨房里的美食指南 | レシピ（懒饭） | － |
| － | 63 | Love, Manuela | 製菓レシピ | － |
| － | 67 | ckbk: discover great cookbooks | 料理本ライブラリ | － |
| － | 70 | Pick Up Limes | 植物性レシピ・栄養 | － |
| － | 71 | ナディア-プロの料理家のレシピで毎日の献立がすぐ決まる | プロ料理家レシピ・献立 | － |
| － | 73 | café-sweets（カフェ・スイーツ） | カフェ・製菓専門誌 | － |
| － | 74 | Bon Appétit: Recipes & Cooking | レシピメディア（Bon Appétit） | － |
| － | 75 | Recipe Keeper | レシピ保存・管理 | － |
| － | 77 | 101 before one | 離乳食（101品目） | － |
| － | 79 | 愛料理 | レシピ（愛料理） | － |
| － | 80 | Kitchen Stories Easy Recipes | レシピ動画（Kitchen Stories） | － |
| － | 81 | Fivesec Health by Alexandra | 植物性レシピ | － |
| － | 82 | Cuisinez pour bébé | 離乳食レシピ | － |
| － | 84 | Pantry - 재고·유통기한·팬트리 | 在庫・賞味期限管理 | － |
| － | 85 | NeatEat - Meal Planner | 献立 | － |
| － | 86 | Sidekick by Sorted Food | 献立・レシピ（Sorted Food） | － |
| － | 87 | Maja Vase | 製菓レシピ（買い切り） | － |
| － | 89 | Meal Prep & Menu Planner App | 作り置き献立 | － |
| － | 90 | Anova Culinary | 低温調理器連携 | － |
| － | 92 | "iCook: 레시피 · 건강한 음식 · 메뉴 " | ヘルシーレシピ | 説明冒頭 |
| － | 93 | ELLE gourmet エル・グルメ | レシピメディア（ELLE gourmet） | － |
| 93 | － | 우리의식탁 - 요리를 스타일하다 | レシピ（AIで作り方提示） | 説明冒頭 |
| － | 95 | 내 요리책 | レシピ帳 | － |
| － | 96 | 마이 레시피 노트 - 요리타이머 레시피정리 | レシピ整理・タイマー | － |
| 96 | － | 푸드랩 - 개인 맞춤 첨가물·영양성분·알레르기 분석 앱 | 添加物・栄養・アレルギー分析 | 説明冒頭 |
| － | 97 | Scoolinary: Learn & Cook | 料理講座 | － |
| － | 99 | Look & Cook: здоровые рецепты | ヘルシーレシピ | － |

取得元：`https://itunes.apple.com/kr/rss/topfreeapplications/limit=100/genre=6023/json`（2026-11-08 16:07:23 UTC）、`https://itunes.apple.com/kr/rss/topgrossingapplications/limit=100/genre=6023/json`（2026-11-08 16:07:24 UTC）

### 2-4 フランス（FR）：対象アプリ 92件

| 無料 | 売上 | アプリ名 | 種別 | AI表記 |
|---:|---:|---|---|---|
| 16 | 1 | Thermomix® Cookidoo® | Thermomix公式レシピ | － |
| 4 | 2 | Yuma : Menus de la semaine | 週間献立・レシピ | － |
| 14 | 4 | Basta Batchcooking - meal prep | 作り置き（バッチクッキング） | － |
| 28 | 5 | Cuisinez pour bébé | 離乳食レシピ | － |
| 5 | 6 | Jow - Recettes, Menus, Courses | 献立・レシピ・ネットスーパー連携 | － |
| 12 | 7 | GoomY: enregistre tes recettes | レシピ保存 | － |
| 57 | 8 | Gronda : Recettes pour Chefs | シェフ向けレシピ | － |
| 48 | 10 | WeChef - Carnet de recettes | レシピ帳 | － |
| 81 | 11 | Mob: Meal Planner and Recipes | 献立・レシピ | － |
| 11 | － | Jowzi - l'IA pour vos courses | AIが献立から買い物まで | 名前 |
| 49 | 12 | Recettes & Idées Repas: ReciMe | レシピ保存・献立・買い物リスト | － |
| 58 | 15 | BellySafe – Manger serein | 妊娠中に食べてよいか判定 | － |
| 15 | － | My Moulinex, la cuisine facile | 調理家電連携（Moulinex） | － |
| 36 | 16 | Cookomix | Thermomix向け投稿レシピ | － |
| － | 17 | NYT Cooking: Quick Tasty Meals | レシピメディア（NYT） | － |
| 39 | 18 | Mezze : Recettes & Idées Repas | 保存動画→レシピ帳・献立 | － |
| － | 19 | Yummix | Thermomix向けレシピ | － |
| 55 | 21 | Nyama : mes recettes rangées | レシピ整理 | － |
| 46 | 22 | Kooki: Enregistre tes recettes | レシピ保存 | － |
| － | 23 | Kuri - Recettes de Saison | 旬のレシピ・週間献立 | － |
| － | 24 | Eatr: IA Plan repas & régime | パーソナライズレシピ提案・食事管理 | 名前 |
| － | 25 | Patate & Cornichon : Recettes | レシピ | － |
| － | 26 | Fou de Pâtisserie | 製菓雑誌 | － |
| － | 27 | America's Test Kitchen | レシピメディア（ATK） | － |
| － | 29 | Saveurs : Recettes de cuisine | レシピ | － |
| － | 30 | SeePantry: Recipes & Meal Plan | 在庫管理・献立 | － |
| － | 31 | All-Clad | 調理器具連携（All-Clad） | － |
| 50 | 32 | 321 Vegan | ヴィーガン適合スキャン | － |
| － | 33 | Pick Up Limes | 植物性レシピ・栄養 | － |
| － | 34 | CookGo: Sauvegarde de recettes | レシピ取込・保存＋食事計画 | － |
| － | 35 | Scoolinary: Learn & Cook | 料理講座 | － |
| － | 36 | Miam - Scan & Cuisine | 手持ち食材スキャン→レシピ | － |
| 38 | 37 | Tably : Recettes & Courses | レシピ・買い物 | － |
| 37 | － | Marmiton : recettes de cuisine | レシピ（Marmiton） | － |
| － | 38 | MealPrepPro Planner & Recipes | 作り置き献立・レシピ | － |
| － | 40 | Pam Fitness & Food | ヘルシーレシピ（Pamela Reif） | － |
| 40 | － | HomeID | 調理家電連携（Philips） | － |
| 41 | － | CuisineAZ : Recettes & Menus | レシピ・献立 | － |
| － | 42 | Recipe Keeper | レシピ保存・管理 | － |
| － | 43 | Zest: Meal Planner & Recipes | 献立・レシピ | － |
| － | 45 | My Recipe Box: Recettes & Menu | レシピ管理・献立 | － |
| － | 47 | Le Figaro: Recettes de cuisine | レシピメディア（Le Figaro） | － |
| － | 48 | TakeMyWeek : compteur calories | カロリー計測・週間献立 | － |
| － | 49 | Simplissime : Cuisine Facile | 簡単レシピ | － |
| － | 50 | Recipe Organizer - Recigen | レシピ取込（AI画像認識） | 説明冒頭 |
| － | 51 | Jeannou | 離乳食 | － |
| － | 52 | Guardian Feast: Daily Recipes | レシピメディア（Guardian） | － |
| － | 53 | MenuGo - Fast-food healthy | ファストフードの注文指南（カロリー） | － |
| 92 | 57 | Osta: Enregistrer recettes | レシピ保存・共有 | － |
| － | 59 | The Pitance - Recettes & Menus | レシピ・献立 | サブ |
| － | 60 | Recettes AI Airfryer+ | AIエアフライヤーレシピ | 名前 |
| － | 61 | KitChef - Feed de recettes | レシピフィード・保存 | － |
| － | 62 | mise - meal planner | 献立・食事計画 | － |
| 62 | － | Magic Meal: menu de la semaine | 週間献立 | － |
| － | 63 | Chipé | レシピを調理ロボ用に変換 | － |
| 63 | － | Monsieur Cuisine App | 調理家電連携（Lidl Monsieur Cuisine） | － |
| － | 64 | レシピはクックパッド -No1節約料理や献立の検索アプリ | レシピ投稿・検索・献立 | － |
| － | 65 | Crouton: Compagnon de cuisine | レシピ管理 | － |
| 85 | 66 | Cookpad, recettes de cuisine | レシピ投稿・検索（Cookpad海外版） | － |
| － | 67 | Recettes & repas - Receply | レシピ管理・献立 | － |
| － | 68 | Manjo - Recettes & Courses | レシピ・買い物 | － |
| 68 | － | Pani : Menus de la semaine | 週間献立 | － |
| － | 69 | Menu de la semaine : ChefBook | 週間献立 | － |
| － | 70 | Appetia - Idée recette facile | 簡単レシピ（コーチ型） | － |
| － | 71 | Honeydew : Recettes & Cuisine | レシピ保存・料理本（AI） | 説明冒頭 |
| 72 | 72 | Zeste : importer des recettes | レシピ取込 | － |
| － | 73 | Gluten Free Scanner | グルテンフリー食品スキャン | － |
| － | 74 | CookBooker: Recettes & Menus | レシピ・献立 | 説明冒頭 |
| － | 75 | Flavorish ／ Save Any Recipe | レシピ保存 | － |
| － | 76 | Bon Appétit: Recipes & Cooking | レシピメディア（Bon Appétit） | － |
| － | 77 | Pestle: Mes recettes | レシピ管理 | － |
| － | 78 | Food Intolerances | 食物不耐症（ヒスタミン等） | － |
| － | 79 | Cookimag | レシピ取込・整理 | － |
| － | 80 | Recipe Organizer - OrganizEat | レシピ保存 | － |
| 82 | 99 | AirfryAddict: Recette Airfryer | エアフライヤーレシピ | － |
| － | 83 | Disha : Menu Semaine & Repas | 予算内の週間献立・食費管理 | － |
| － | 84 | ELLE à table Mag | レシピ雑誌（ELLE à table） | － |
| － | 85 | Reciply - Importer recettes | レシピ取込 | 説明冒頭 |
| 86 | － | Frigo Magic: Cuisine antigaspi | 冷蔵庫の残り物でレシピ | － |
| － | 87 | BLW Brasil - Alimentação bebês | 離乳食（BLW） | － |
| － | 88 | Love, Manuela | 製菓レシピ | － |
| － | 89 | omnomnom | 栄養学習・食事改善 | － |
| － | 90 | Menu de la Semaine IA | 週間献立（AI） | 名前 |
| － | 92 | CoursesPlanner: menu & courses | 献立・買い物 | － |
| － | 94 | CookBook: Carnet de recettes | レシピ管理 | サブ |
| － | 95 | Diversification : DME & BLW | 離乳食 | 説明冒頭 |
| 95 | － | Planificateur Menu Semaine | 週間献立 | － |
| － | 96 | Youmeal: importer recettes | レシピ取込 | － |
| － | 97 | MiamChip: Menu Semaine Budget | 予算内の週間献立 | － |
| － | 98 | Cuisine Actuelle le magazine | レシピ雑誌（Cuisine Actuelle） | － |
| － | 100 | Mela - Recipe Manager | レシピ管理 | － |
| 100 | － | Magimix | 調理家電連携（Magimix） | － |

取得元：`https://itunes.apple.com/fr/rss/topfreeapplications/limit=100/genre=6023/json`（2026-11-08 16:07:25 UTC）、`https://itunes.apple.com/fr/rss/topgrossingapplications/limit=100/genre=6023/json`（2026-11-08 16:07:26 UTC）

### 2-5 ドイツ（DE）：対象アプリ 90件

| 無料 | 売上 | アプリ名 | 種別 | AI表記 |
|---:|---:|---|---|---|
| 12 | 1 | Die Thermomix® Cookidoo® App | Thermomix公式レシピ | － |
| － | 2 | food with love: Rezepte | レシピ（Thermomix対応） | － |
| 2 | 3 | mise – Essensplaner | 献立・食事計画 | － |
| 31 | 4 | Chefkoch – Rezepte & Kochen | レシピ（Chefkoch） | － |
| 21 | 5 | Rezepte - Was kann ich essen? | SNSレシピ保存×特売連動 | － |
| 22 | 6 | Choosy: Essensplaner & Rezepte | 献立・レシピ | － |
| 38 | 7 | ReciMe: Rezepte & Essensplaner | レシピ保存・献立・買い物リスト | － |
| 39 | 8 | Miso - Recipe Keeper | レシピ保存 | － |
| 95 | 9 | Gronda: Rezepte für Köche | シェフ向けレシピ | － |
| 9 | 42 | scoops. | クリエイターレシピ集約 | － |
| 40 | 10 | KptnCook: Rezepte & Kochen | レシピ・買い物リスト | － |
| 49 | 11 | GoomY: Speichere deine Rezepte | レシピ保存 | － |
| 81 | 12 | ZauberTopf Rezepte | Thermomix向けレシピ誌 | 説明冒頭 |
| － | 14 | ZauberMix für Monsieur Cuisine | Monsieur Cuisine向けレシピ誌 | － |
| － | 15 | Pam | ヘルシーレシピ（Pamela Reif） | － |
| 64 | 16 | Mob: Meal Planner and Recipes | 献立・レシピ | － |
| － | 17 | NYT Cooking: Quick Tasty Meals | レシピメディア（NYT） | － |
| － | 18 | EAT SMARTER | 健康レシピ（EAT SMARTER） | － |
| 53 | 19 | Histamin, Fructose: InTolerApp | 食物不耐症（ヒスタミン等） | － |
| 72 | 20 | Air Fryer Club | エアフライヤーレシピ | － |
| 36 | 21 | Low Carb Rezept des Tages | 低糖質レシピ | － |
| － | 22 | Beikost App | 離乳食 | － |
| 34 | 24 | Yuma: Essensplaner & Rezepte | 週間献立・レシピ | － |
| 45 | 25 | Osta: Rezepte speichern | レシピ保存・共有 | － |
| 25 | － | HomeID | 調理家電連携（Philips） | － |
| － | 26 | EOK - KI Kalorienzähler | AIカロリー計算・低糖質 | 名前 |
| － | 27 | Kitchen Stories Rezepte Kochen | レシピ動画（Kitchen Stories） | － |
| － | 28 | Recipe Keeper | レシピ保存・管理 | － |
| 28 | 64 | Einfach Backen | 製菓レシピ（Burda） | － |
| － | 29 | Pick Up Limes | 植物性レシピ・栄養 | － |
| － | 30 | AMC Cook & Go | 調理器具連携（AMC） | － |
| － | 33 | WMF | 調理器具連携（WMF） | － |
| － | 34 | Guardian Feast: Daily Recipes | レシピメディア（Guardian） | － |
| － | 37 | Smantry ／ speisekammer.app | 食品庫・在庫管理 | － |
| － | 38 | Gluten Free: Rezepte & Magazin | グルテンフリーレシピ | － |
| － | 41 | Zuckerfrei Einkaufen | 無糖食品の買い物ガイド | － |
| － | 44 | America's Test Kitchen | レシピメディア（ATK） | － |
| － | 45 | Chow: Meal Planner & Groceries | 献立・買い物 | － |
| － | 46 | Basische Ernährung | アルカリ食レシピ・週間プラン | － |
| － | 47 | fullfilled | ヘルシーレシピ・ライフスタイル | － |
| － | 48 | Sidekick by Sorted Food | 献立・レシピ（Sorted Food） | － |
| － | 49 | Fivesec Health by Alexandra | 植物性レシピ | － |
| 51 | 50 | Clove: Rezepte sammeln | レシピ収集 | － |
| － | 51 | Crouton: Kochbegleiter | レシピ管理 | － |
| － | 53 | Flavorish ／ Save Any Recipe | レシピ保存 | － |
| － | 54 | Mela - Recipe Manager | レシピ管理 | － |
| － | 55 | Rezepte Speichern RecipeSnap | レシピ保存 | － |
| － | 56 | Tanjas glutenfrei | グルテンフリーレシピ | － |
| － | 57 | TGB: Meal Planner & Recipes | 献立・レシピ | － |
| 82 | 58 | RezepteMix | レシピをThermomix等向けに変換 | － |
| － | 59 | Histamin, Fructose & Co. | 食物不耐症（ヒスタミン等） | － |
| 60 | － | Monsieur Cuisine App | 調理家電連携（Lidl Monsieur Cuisine） | － |
| － | 61 | FitTasteTic - Gesunde Rezepte | ヘルシーレシピ | － |
| － | 62 | Rezept-Manager - Recipe Bro | レシピ管理 | － |
| － | 65 | Foodie: Recipe Organizer | レシピ管理 | － |
| 65 | － | einfachkochen.de | レシピ（Burda） | － |
| － | 67 | Receptly: Rezepte speichern | レシピ保存 | － |
| － | 68 | Eatr: KI Rezepte zum Kochen | パーソナライズレシピ提案・食事管理 | 名前 |
| － | 69 | Cestio: Essensplaner | 献立 | 説明冒頭 |
| － | 71 | BLW & Beikost: Babyrezepte | 離乳食（BLW） | － |
| － | 72 | Pantrist - Einkaufsliste | 買い物リスト・在庫 | － |
| － | 73 | Vorratskammer | 食品庫管理 | － |
| 73 | 79 | Yedeni: KI-Ernährungsassistent | AI栄養アシスタント | 名前 |
| － | 74 | NoWaste: Lebensmittelliste | 食品在庫・期限管理 | サブ |
| － | 76 | Olivers Glutenfreie Welt | グルテンフリーレシピ | － |
| － | 77 | So isst Italien | イタリア料理誌 | － |
| 77 | － | MEATER® Fleischthermometer | 肉用温度計連携 | － |
| － | 78 | Grubsy: Beikost App - BLW Brei | 離乳食 | － |
| 79 | － | TapCook: Budget Meal Plans | 節約献立 | － |
| － | 80 | Disha: Essensplaner & Rezepte | 予算内の週間献立・食費管理 | － |
| － | 81 | Gluten Free Scanner | グルテンフリー食品スキャン | － |
| － | 82 | Flyva: Rezepte aus Angeboten | 特売チラシから週間献立 | － |
| － | 83 | Low Carb - Rezepte | 低糖質レシピ | － |
| － | 84 | CookBook: Rezeptmanager | レシピ管理 | サブ |
| 84 | － | Bosch BetterFood | 家電メーカーのレシピ・栄養（Bosch） | － |
| － | 85 | Gefrierschrank-Inventar | 冷凍庫在庫管理 | － |
| － | 86 | Rezepte zum Kochen - Kochbuch | レシピ | － |
| － | 87 | WeChef – Mein Rezeptbuch | レシピ帳 | － |
| － | 88 | Rezepte Speichern – OrganizEat | レシピ保存 | － |
| － | 90 | Mein Rezeptebuch | レシピ帳 | － |
| － | 91 | Rezepte speichern - Mr. Cook | レシピ保存 | サブ |
| － | 92 | Zöliakie & Glutenfrei Ratgeber | セリアック病・グルテンフリー | － |
| － | 93 | BLW Brasil - Alimentação bebês | 離乳食（BLW） | － |
| － | 95 | Sparchef: Rezepte & Angebote | 特売品からレシピ提案 | － |
| － | 96 | FODMAP Diät - KI-Rezepte | 低FODMAP食・AIレシピ | 名前 |
| － | 97 | Wochenplan & Essensplaner | 週間献立 | － |
| 97 | － | Whipp: Essensplaner & Rezepte | 献立・レシピ | － |
| － | 98 | Lecker - Rezepte für jeden Tag | レシピ（Lecker） | － |
| － | 99 | Just the Recipe: Cook smarter | Webレシピ抽出 | － |
| － | 100 | NeatEat - Essensplaner | 献立 | － |

取得元：`https://itunes.apple.com/de/rss/topfreeapplications/limit=100/genre=6023/json`（2026-11-08 16:07:27 UTC）、`https://itunes.apple.com/de/rss/topgrossingapplications/limit=100/genre=6023/json`（2026-11-08 16:07:28 UTC）

## 3. ヘルスケア／フィットネス（genre 6013）での食事管理系（日本・米国）

### 3-1 指定アプリの順位

| アプリ | 日本 売上 | 日本 無料 | 米国 売上 | 米国 無料 | AI表記（日／米） | 評価件数（日／米） | 補足 |
|---|---:|---:|---:|---:|---|---|---|
| あすけん | 1 | 6 | 提供なし | 提供なし | －／－ | 148,543／－ | 米国の製品ページは404、Lookup にも該当なし |
| カロミル | 6 | 8 | 圏外 | 圏外 | －／－ | 45,745／183 | 米国ストアでも配信している |
| Cal AI | 圏外 | 圏外 | 11 | 13 | 名前／名前 | 1,032／374,535 | 日本でも配信しているが日本語サブタイトルなし（英語版は「Food & Macro Counter」） |
| MyFitnessPal | 35 | 圏外 | 1 | 18 | －／サブ | 30,475／2,390,557 | 米国のサブタイトルは「AI Coach & Nutrition Tracker」 |

取得元：
- `https://itunes.apple.com/jp/rss/topgrossingapplications/limit=100/genre=6013/json`（2026-11-08 16:07:29 UTC）
- `https://itunes.apple.com/jp/rss/topfreeapplications/limit=100/genre=6013/json`（16:07:29 UTC）
- `https://itunes.apple.com/us/rss/topgrossingapplications/limit=100/genre=6013/json`（16:07:30 UTC）
- `https://itunes.apple.com/us/rss/topfreeapplications/limit=100/genre=6013/json`（16:07:31 UTC）
- 評価件数・提供有無：`https://itunes.apple.com/lookup?id=…&country=jp|us`（16:25:40 UTC）
- サブタイトル：`https://apps.apple.com/{jp|us}/app/id{ID}`（16:18〜16:20 UTC）

### 3-2 日本：ヘルスケア／フィットネス 売上上位100の食事管理系（14件）

| 売上 | 無料（参考） | アプリ名 | 開発元 | 内容 | AI表記 | 評価件数（参考） |
|---:|---:|---|---|---|---|---:|
| 1 | 6 | あすけん ダイエット・ヘルスケアのカロリー計算や体重管理に | asken inc. (Tokyo) | 食事記録・カロリー・栄養アドバイス | － | 148,543 |
| 6 | 8 | カロミル - ダイエット、カロリー＆PFC管理の健康アプリ | Life Log Technology, Inc. | 食事記録・カロリー/PFC | － | 45,745 |
| 15 | 50 | WiseMeal：AIカロリー計算・食事管理 | Enjoyment International Li | AIカロリー計算・食事管理 | 名前 | 1,146 |
| 16 | 96 | カロリートラッカー:FoodPilot | Hong Kong Radiant Limited | カロリートラッカー | － | 211 |
| 22 | 圏外 | マクロファクターPFC・ダイエット・食事管理・カロリー計算 | Stronger By Science Techno | マクロ栄養素・体重管理 | － | 1,164 |
| 33 | 圏外 | おいしい健康｜献立と栄養管理 糖尿病・減塩・腎臓病など | Oishi kenko Inc. | 献立と栄養管理（疾病対応） | サブ | 3,319 |
| 35 | 圏外 | MyFitnessPal: 健康管理 | MyFitnessPal, Inc. | 食事記録・カロリー | － | 30,475 |
| 41 | 圏外 | INOUT：ダイエット・カロリー計算・体重記録 | Mynormal Company | カロリー計算・体重記録 | － | 377 |
| 54 | 圏外 | Calo: 健康管理 | Next Vision Limited | カロリー計算 | － | 896 |
| 56 | 圏外 | FiNC ダイエット・健康管理のカロリー計算や体重記録アプリ | FINC TECHNOLOGIES INC. | カロリー計算・体重記録 | － | 102,549 |
| 59 | 圏外 | カルシー Calsee 写真で簡単カロリー計算・ダイエット | Pixel Tokyo Inc. | 写真でカロリー計算 | － | 1,271 |
| 62 | 48 | カロミー：ダイエット・AIカロリー計算＆食事記録 | labi inc. | AIカロリー計算・食事記録 | 名前 | 795 |
| 71 | 圏外 | Yazio: AIカロリー計算 ダイエット記録 | YAZIO | AIカロリー計算・ダイエット記録 | 名前 | 6,000 |
| 80 | 圏外 | メシトラ - カロリー記録, PFC バランス 計算 | Jun Hirobayashi | カロリー・PFC記録 | － | 2,330 |

取得元：`https://itunes.apple.com/jp/rss/topgrossingapplications/limit=100/genre=6013/json`（2026-11-08 16:07:29 UTC）と `https://itunes.apple.com/jp/rss/topfreeapplications/limit=100/genre=6013/json`（16:07:29 UTC）。評価件数は `https://itunes.apple.com/lookup?id=…&country=jp`（16:25:40 UTC）。
※おいしい健康のサブタイトルは「献立・記録・相談をこれ1つで。AIと管理栄養士が毎日サポート」。献立型のアプリだが、カテゴリはヘルスケアに置いている。

### 3-3 米国：ヘルスケア／フィットネス 売上上位100の食事管理系（19件、無料のみ上位100入りの3件を末尾に追加）

| 売上 | 無料（参考） | アプリ名 | 開発元 | 内容 | AI表記 | 評価件数（参考） |
|---:|---:|---|---|---|---|---:|
| 1 | 18 | MyFitnessPal: Calorie Counter | MyFitnessPal, Inc. | 食事記録・カロリー | サブ | 2,390,557 |
| 11 | 13 | Cal AI - Calorie Tracker | Viral Development LLC | 写真でカロリー計算 | 名前 | 374,535 |
| 12 | 98 | MacroFactor: Macro Tracker | Stronger By Science Techno | マクロ栄養素・体重管理 | － | 23,891 |
| 18 | 圏外 | WeightWatchers Program | WW International, Inc. | 減量プログラム | － | 2,366,864 |
| 19 | 22 | Cronometer: Calorie Counter | Cronometer Software Inc | 栄養素トラッキング | － | 100,483 |
| 21 | 50 | Calorie Counter - MyNetDiary | MyNetDiary Inc. | カロリー・食事記録 | － | 171,852 |
| 22 | 77 | Lose It! – Calorie Counter | FitNow | カロリー・食事記録 | － | 783,867 |
| 27 | 5 | Yuka - Food & Cosmetic Scanner | Yuca | 食品スキャン（健康スコア） | － | 102,037 |
| 29 | 52 | MeAgain: GLP-1 Tracker App | Dots Future Technologies | GLP-1服薬トラッカー（参考） | － | 40,259 |
| 32 | 圏外 | Noom Weight Loss, Food Tracker | Noom, Inc. | 減量プログラム・食事記録 | － | 874,107 |
| 46 | 11 | MenuFit - Healthy Eating Out | Kosco Digital LLC | 外食時の注文ガイド（栄養） | － | 54,557 |
| 58 | 95 | Foodvisor - AI Calorie Counter | Foodvisor | AIカロリー計算 | 名前 | 18,351 |
| 61 | 84 | Calo: AI Food Calorie Counter | Next Vision Limited | AIカロリー計算 | 名前 | 27,690 |
| 63 | 圏外 | Calorie Counter by Numify | Municorn Limited | カロリー計算 | － | 43,161 |
| 68 | 圏外 | Shotsy GLP-1 Tracker | Shotsy | GLP-1服薬トラッカー（参考） | － | 34,646 |
| 80 | 61 | AI Calorie Tracker:FoodPilot | Hong Kong Radiant Limited | AIカロリートラッカー | 名前 | 3,085 |
| 84 | 圏外 | 1st Phorm | First Phorm | トレーニング＋栄養記録・コーチ | － | 5,796 |
| 94 | 圏外 | MacrosFirst - Macro Tracker | MacrosFirst, Inc. | マクロ栄養素トラッカー | － | 23,707 |
| 97 | 圏外 | Carbon - Macro Coach & Tracker | Reform LLC | マクロ栄養素コーチ | － | 8,146 |
| 圏外 | 62 | WISEcode UPF Detector | WISEcode | 超加工食品スキャン | － | 1,821 |
| 圏外 | 71 | Nourish: Eating Well Made Easy | Nourish Inc. | 管理栄養士のオンライン指導 | － | 33,005 |
| 圏外 | 88 | Exposr - Food Product Scanner | Nagia LLC | 食品スキャン（添加物） | － | 5,593 |

取得元：`https://itunes.apple.com/us/rss/topgrossingapplications/limit=100/genre=6013/json`（2026-11-08 16:07:30 UTC）と `https://itunes.apple.com/us/rss/topfreeapplications/limit=100/genre=6013/json`（16:07:31 UTC）。評価件数は `https://itunes.apple.com/lookup?id=…&country=us`（16:25:40 UTC）。
※GLP-1服薬トラッカー2件は食事管理の周辺領域として参考掲載した。Bevel（54位、AIヘルスコーチ）と Hume Health（10位）は総合ヘルスケアのため除外した。

## 4. 「AI」を名前・サブタイトルに掲げる対象アプリ（フード／ドリンク）

| 国 | 無料 | 売上 | アプリ名 | 表記箇所 | サブタイトル |
|---|---:|---:|---|---|---|
| 日本 | － | 13 | レシピ記録・献立作成・買い物リスト管理 - レピッタ | サブ | AIで記録・保存、献立と買い物まで一括管理して家族で共有 |
| 日本 | － | 23 | mogmee(モグミー) - レシピ・献立・カロリー計算 | サブ | レシピ動画をAI保存・材料と栄養/PFCを自動抽出 |
| 日本 | － | 28 | レピモ｜レシピ管理・献立表＆買い物リスト | サブ | 写真やURLからAIで自動登録・家族と共有 |
| 日本 | － | 29 | mogumogu — 食事を可愛くステッカー日記に | サブ | AI で記録、コラージュで共有 |
| 日本 | － | 31 | Noms - 食事日記 & 記録 | サブ | AIスティッカーで食事を記録 |
| 日本 | － | 48 | Disha: 節約献立と自炊・食費管理 | サブ | AIが1週間分の買い物リストを自動作成 |
| 日本 | － | 62 | マグネットレシピ ／ あらゆるレシピを保存する | サブ | AI解析でサイトや動画・写真から料理レシピを簡単に保存 |
| 日本 | － | 69 | MOGLIA（もぐりあ） | サブ | AIがあなた専用の献立を作成。毎日のごはんづくりをラクに！ |
| 日本 | － | 87 | 開運レシピ - 九星気学と薬膳で運気アップのAI献立 | 名前・サブ | 今日の吉星食材×薬膳で開運！AIシェフが献立を提案 |
| 日本 | － | 89 | AI予算献立 | 名前 | 1週間分の献立を家族に合わせて提案 |
| 米国 | － | 34 | Honeydew: Recipe & Cookbook AI | 名前 | Meal Planner & Grocery List |
| 米国 | － | 50 | Meal Planner: FoodiePrep AI | 名前 | Recipe Keeper & Grocery List |
| 米国 | － | 78 | Ai System | 名前 | （なし） |
| 米国 | － | 82 | FoodGauge: Food Health Scanner | サブ | AI Food Scanner & Analyzer |
| 米国 | － | 98 | BakeWay: AI Baking Assistant | 名前 | Smart baking guidance |
| 韓国 | 30 | 5 | 해먹으리 - AI가 SNS 요리 영상을 레시피로! | 名前・サブ | 유튜브, 인스타 링크 공유만 하면, AI가 레시피로! |
| 韓国 | － | 22 | 냉장고 털기 : AI 재료 관리부터 냉장고 파먹기까지 | 名前 | 냉장고 재료를 관리, 있는 재료로 레시피를 추천 |
| 韓国 | － | 40 | Noms - 음식 다이어리 & 기록 | サブ | AI 스티커로 식사를 기록하세요 |
| フランス | 11 | － | Jowzi - l'IA pour vos courses | 名前 | Super-Assistant de la maison |
| フランス | － | 24 | Eatr: IA Plan repas & régime | 名前 | Recettes saines suivi calories |
| フランス | － | 59 | The Pitance - Recettes & Menus | サブ | Import IA, planning & courses |
| フランス | － | 60 | Recettes AI Airfryer+ | 名前 | Repas rapides, santé assurée |
| フランス | － | 90 | Menu de la Semaine IA | 名前 | Planificateur Repas & Courses |
| フランス | － | 94 | CookBook: Carnet de recettes | サブ | Import IA & Liste de courses |
| ドイツ | － | 26 | EOK - KI Kalorienzähler | 名前 | Ernährungstagebuch & Routinen |
| ドイツ | － | 68 | Eatr: KI Rezepte zum Kochen | 名前 | Essensplaner, Diät, Cooking |
| ドイツ | 73 | 79 | Yedeni: KI-Ernährungsassistent | 名前 | Nutrition, solved. |
| ドイツ | － | 74 | NoWaste: Lebensmittelliste | サブ | Vorräte verwalten mit AI |
| ドイツ | － | 84 | CookBook: Rezeptmanager | サブ | KI-Import & Einkaufsliste |
| ドイツ | － | 91 | Rezepte speichern - Mr. Cook | サブ | Kochbuch & Wochenplan mit KI |
| ドイツ | － | 96 | FODMAP Diät - KI-Rezepte | 名前 | Low FODMAP Liste in deutscher |

取得元：
- RSS（アプリ名・順位）：`https://itunes.apple.com/{cc}/rss/{topfreeapplications|topgrossingapplications}/limit=100/genre=6023/json`（2026-11-08 16:07:21〜16:07:28 UTC）
- サブタイトル：`https://apps.apple.com/{cc}/app/id{ID}`（16:18〜16:20 UTC）。現地語のサブタイトルがない場合は、`?l=en-US` で取得した英語版で判定した。

**補足**
- 説明文のどこかでAIに触れている対象アプリは、日本 17/54・米国 21/76・韓国 15/58・フランス 27/92・ドイツ 17/90。
- 各チャートのTOP10に入った対象アプリは延べ42件。このうち説明文まで含めてAIに触れているのは延べ10件（6アプリ）だった。
  - 해먹으리：名前・サブタイトル
  - 냠냠쩝쩝 레시피북：説明冒頭
  - CookGo：説明文中に「AIレシピアシスタント」
  - Gronda：説明文中に「AI Recipe Creator」。米・韓・仏・独の4チャート
  - KptnCook：説明文中に「KI-Kochassistent」
  - Yuma：説明文末尾で「献立・レシピ・料理写真はAIで作成」と明記。仏の無料・売上の2チャート
- それ以外のTOP10入りアプリは、説明文でもAIに触れていない。ReciMe、NYT Cooking、TapCook、mise、Whipp、Osta、クックパッド、クラシル、デリッシュキッチン、ナディア、Jow、Basta、Choosy、Thermomix Cookidoo などがこれにあたる。
- AI表記アプリの最高順位：
  - 日本：売上13位（レピッタ）
  - 米国：売上34位（Honeydew）
  - 韓国：売上5位（해먹으리）
  - フランス：無料11位（Jowzi）
  - ドイツ：売上26位（EOK）
- 全チャートの上位10位に入ったAI表記アプリは 해먹으리 だけ。
- ヘルスケア側では、AI表記が上位にも及んでいる。米国 MyFitnessPal（売上1位）はサブタイトルに「AI Coach」、Cal AI（同11位）は名前にAIを入れている。日本でも WiseMeal（15位）、カロミー（62位）、Yazio（71位）が名前に、おいしい健康（33位）がサブタイトルにAIを入れている。

## 5. Google Play

| 国 | 無料（フード＆ドリンク） | 売上（フード＆ドリンク） |
|---|---|---|
| 日本 | 取得不可 | 取得不可 |
| 米国 | 取得不可 | 取得不可 |
| 韓国 | 取得不可 | 取得不可 |
| フランス | 取得不可 | 取得不可 |
| ドイツ | 取得不可 | 取得不可 |

取得を試したもの：
- カテゴリページ `https://play.google.com/store/apps/category/FOOD_AND_DRINK?hl=ja&gl=JP`（2026-11-08 16:21 UTC、HTTP 200）
  - 「人気のフード＆ドリンクアプリ（無料）」の枠と、無料／売上トップ／有料トップの切り替えはあった。
  - ただし順位リストはHTMLに含まれていなかった。
- Web版の内部API `https://play.google.com/_/PlayStoreUi/data/batchexecute`（16:22〜16:23 UTC）
  - 問い合わせはエラー（PlayDataError）になった。
- Google Play には App Store のような公開ランキングRSSがない。このため本調査では取得不可とした。

## 読み取れること

- 無料上位100で対象（レシピ等）が占める件数は、日本5件（最高57位デリッシュキッチン、残り79件は外食チェーン）、米国6件（最高11位）、韓国4件（最高30位）と少ない。上位はチェーン・デリバリーの公式アプリが中心。フランス（32件、Yuma 4位・Jow 5位）とドイツ（29件、mise 2位）は、献立・レシピ系が無料上位にも入っている。
- 売上上位100では、5か国とも対象アプリが過半を占める（日54・米76・韓56・仏81・独83）。日本の上位はクックパッド（1位）・クラシル（3位）・デリッシュキッチン（4位）・ナディア（5位）という大手レシピメディア型。これらは名前やサブタイトルに「献立」を入れており、献立は大手レシピアプリの一機能として扱われている。
- 米・仏・独の売上上位には、献立・食事計画型（米19件・仏17件・独13件。例：TapCook 3位・mise 4位・Whipp 7位、Yuma 2位・Basta 4位・Jow 6位、mise 3位・Choosy 6位）と、SNS/Webレシピ保存型（米23・仏25・独21件）の新興アプリが厚い。日本で「献立・食事計画」に分類したアプリは最高でも meek 36位・Mob 37位だった。CookGo（7位）、レピッタ（13位）、ReciMe（20位）は保存型で、献立機能を併せ持つ。献立専業の大手が不在の空白に見える（推測）。
- ReciMe（日20・米1・韓3・仏12・独7位）、Mob、Disha、mise など海外の献立・保存アプリが複数国に展開している。日本でも「献立カレンダー」「節約献立」といった日本語名でローカライズして売上上位100に入っている。
- 「食費・予算」に訴えるアプリが各国に出ている。米 TapCook（店頭価格で献立）・Whipp（Budget Dinners）、仏 Yuma（金額付き買い物）・MiamChip、独 Flyva・Sparchef（特売チラシから献立）、日 Disha・AI予算献立がこれにあたる。
- 「AI」を名前・サブタイトルに掲げる対象アプリは少数派（売上で日10・米5・韓3・仏5・独7件）で、上位10位入りは韓国の 해먹으리（売上5位）だけ。主力の献立・レシピアプリの多くは、説明文でもAIに触れていない。一方ヘルスケア側では、MyFitnessPal（米1位、AI Coach内蔵）や Cal AI（米11位、写真で食事記録）のように、AIを前面に出すアプリが上位にいる。
- 日本のヘルスケア売上は、あすけん1位・カロミル6位という国内勢が強い。Cal AI（米11位）は日本では圏外、MyFitnessPal は日35位にとどまる。献立と栄養をつなぐ「おいしい健康」（33位、AIと管理栄養士）もヘルスケア側に置かれている。
- 仏・独では Thermomix Cookidoo が売上1位で、家電連携レシピ（Monsieur Cuisine、My Moulinex、HomeID など）や、離乳食・グルテンフリー・不耐症・妊娠中の食事といった制約付き食事のアプリも上位に入る。日本の上位100に家電連携型はなく、離乳食・妊娠中の食事系は47〜65位にとどまる。

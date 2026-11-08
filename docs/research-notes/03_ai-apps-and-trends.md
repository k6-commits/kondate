> **注意**：これは調査エージェントが書いた作業メモで、本文は書き換えていない。数値と日付は出典に当たって照合した。修正が必要だった項目は [verification.md](verification.md) にまとめ、レポート本体には修正後の内容を使っている。

# 03 世界のLLM/AI献立・料理アプリ：全体像・トレンド・市場（2024〜2026）

調査日：2026-11-08。日本以外が中心。［n］は末尾の出典番号。数値には時点を併記した。「未確認」は一次情報で裏付けが取れなかったもの。
※調査終盤でWeb検索の上限（セッション共有）に達したため、Lifesum、Samsung Foodの2025年12月改定の中身、「AI献立アプリ市場」の追加推計（TBRC等）は未検証のまま。必要なら追加で調べる。

## 0. 要点

- **「献立→カート」はもう差別化にならない。** 2025〜26年に、小売（Instacart、Walmart、Kroger、Albertsons、Tesco、Woolworths、Shipt）と汎用AI（ChatGPT、Gemini/AI Mode、Claude、Alexa+、Meta Muse）の両方で標準機能になった。単体アプリは淘汰が進んでいる（Mealimeが2026-10-21、Ollieが2026-11-06に終了）［22］［26］。
- **AIの中で決済まで完結させる試みはつまずいた。** OpenAIは2026年3月にInstant Checkoutをやめた。Walmartの比較では、ChatGPT内で決済した場合のコンバージョンは自社サイトへ送った場合の3分の1だった［51］［52］。現在の主流は「AIがカートを作り、最後の確定は人がタップ」。
- **課金が伸びたのは2つの型。** 1つは「SNS動画のレシピを保存・整理し、献立と買い物リストにつなぐ」型で、ReciMeが2025年Q3〜Q4に米国Food & Drinkカテゴリの課金で首位級だった［5］［6］。もう1つは「写真1枚でカロリーを出す」型で、Cal AIは2年弱で年商3,000万ドルを超え、MyFitnessPalに買収された［36］。
- **市場規模の推計は定義によって約4倍違う。** 献立アプリ市場の2025年推計は3.8億〜14.7億ドル。成長率はどの推計でも年10〜14%程度［82］［83］［85］。
- **収益の相場と稼ぎ方。** 単体アプリは月3〜7ドル（年30〜60ドル）のサブスクが中心。大手は小売への送客とリテールメディア（Instacartの広告等収入は2025年に10.65億ドル）［49］、白ラベルのB2B提供で稼いでいる。

## 1. カタログ

国と開始時期は、出典で確認できたものだけを書いた。

### 1-1 献立・レシピ管理アプリ

| アプリ（国・開始） | AIの使い方 | 主な機能 | 価格（時点） | 人気指標（時点） | 状況 |
|---|---|---|---|---|---|
| **Samsung Food**（韓Samsung。旧Whisk、販売元Foodient Ltd。2023-08に改称［95］。Samsungの買収年は未確認） | 生成（週間献立）。画像認識（料理本・手書きレシピの写真をデジタル化、食材写真を在庫に登録）。調理手順のAI化 | 保存、献立、買い物リスト、栄養、在庫・期限通知、冷蔵庫Family Hub連携 | Food+ 月6.99ドル／年59.99ドル（米App Store、2026-11）［2］ | 600万ユーザー超（2024-07）。104か国・8言語［1］。App Store 4.8（6.4千件）［2］ | 無料でも週間献立を2回試せる［2］ |
| **ReciMe**（豪州発、2024年に本拠をNYへ［9］） | Instagram／TikTok／Facebook／YouTube／Pinterestから取り込み、画像インポート | 保存、週間献立、売り場順の買い物リスト、宅配注文 | ReciMe Plus 29.99〜59.99ドル（期間の表記なし）［8］ | 米Food & Drink課金で首位級：週次売上のピーク約52.5万ドル、週次DL最大約25.4万、アクティブ110万→約180万（2025Q3）［5］。App Store 4.8（33万件）、Food & Drink無料11位（2026-11-08）［8］。自社主張1,500万ユーザー［8］ | 2024年にA$150万のシード［9］ |
| **Pestle**（個人開発、iOS） | オンデバイスAI（Apple Intelligence）でWebやSNSのレシピを解析 | Reels取り込み（2024-07）、TikTok動画を手順と栄養に変換（2024-11）［10］［11］ | Pro 月2.99ドル／年24.99ドル／買い切り39.99〜49.99ドル［12］ | 4.7（1.9千件）［12］ | 継続 |
| **Honeydew**（Red Honey LLC） | 動画・Reelsの取り込み、料理写真からレシピ生成（いわゆるcopycat）、AI献立 | 食事法別の献立、買い物リストの自動作成 | 月6.99ドル／年39.99ドル（上位Proは59.99〜99.99ドル）［13］ | 4.8（1.9千件）［13］。資金調達は未確認 | 継続 |
| **Crouton／Flavorish／Deglaze** | Croutonは写真取り込み。FlavorishはAI生成とSNS取り込み。Deglazeは動画の映像そのものを解析すると自社で主張 | レシピ管理 | Crouton 年14.99ドル（競合サイトの記載、要確認）［15］ | 未確認 | 情報源は競合・自社ページのみ［15］［16］ |
| **Paprika**（Hindsight Labs） | 代替食材の提案のみ（Apple Intelligence） | 保存、献立、買い物リスト、音声の調理モード | Paprika 4は無料（50件まで）＋Premiumサブスク。SNSからの取り込みはPremium［17］ | 未確認 | 買い切り型からサブスクへ移行（移行時期は未確認）［17］ |
| **Plan to Eat** | AI機能は確認できず | 取り込み、献立、家族共有 | 月5.95ドル／年49ドル（2024-12）［18］ | 未確認 | 継続 |
| **AnyList** | AIの記載なし | 共有買い物リスト、献立 | Complete 年9.99ドル（個人）／14.99ドル（世帯）［19］ | 未確認 | 継続 |
| **Mealie**（OSS、セルフホスト） | OpenAI互換API／Ollamaでスクレイプ失敗時の解析、写真からの取り込み、翻訳 | レシピ、献立、買い物リスト | 無料（APIの費用は利用者負担） | GitHub 1.38万スター（2026-11）［20］ | 継続 |
| **Eat This Much** | 「AI」とは名乗らない。献立の自動生成と栄養ラベル写真の読み取り | 栄養目標と予算から週間献立と買い物リストを作りメールで送る | 年払いで月5ドル、月払いで14.99ドル［21］ | App Store 4.7（2.2万件）［21］ | 継続 |
| **DishGen／ChefGPT** | 食材からレシピを生成・改変 | レシピ生成 | DishGen 月7.99ドル／年79.99ドル（無料は月15回）［27］。ChefGPT Pro 月2.99ドル（競合サイトの記載）［28］ | DishGenはApp Store評価4件のみ［27］。利用者数は未確認 | 小規模 |
| **SideChef** | 料理写真からレシピを作るRecipeGen AI（ベータ、2024-08） | 小売・食品メーカー・家電向けの白ラベル提供 | B2B（注文単位の広告など）［29］ | 未確認 | B2Bが中心 |
| **Tasty Botatouille**（BuzzFeed） | ChatGPT API＋自社の機械学習 | 料理Q&A、冷蔵庫の食材から提案 | 無料 | 未確認 | 2023-05開始［30］。2024年以降の状況は未確認 |
| **Jow**（仏、2017〜） | 質問票によるパーソナライズ（AIとは名乗らない） | 献立から小売ECのカートへ | 無料（小売との連携で収益） | 仏で600万ユーザー（2024-02）［31］ | Series Aは計3,300万ドル。米国ではKrogerなどと連携［31］ |

### 1-2 栄養・カロリー系（画像認識）とヘルスケア

| 名称 | AIの使い方 | 価格 | 指標（時点） | 状況 |
|---|---|---|---|---|
| **MyFitnessPal** | 写真で食事を記録。Intent由来の献立機能 | Premium+ 年99.99ドル（2025-02発表時）［35］ | 米iOSの週次売上ピーク約280万ドル、アクティブ約410万（2025年12月末）［39］ | 2025-02にIntent、2025-12にCal AIを買収（発表は2026-03-02）［35］［36］ |
| **Cal AI**（10代が創業、2024年頃に開始） | 料理写真からカロリーを推定 | アプリ内課金 2.99〜29.99ドル［37］ | 1,500万DL超、年商3,000万ドル超（2年弱、2026-03時点）［36］。App Store 4.8（37.5万件）、Health & Fitness無料13位（2026-11-08）［37］ | MFP傘下で独立運営を続ける［36］ |
| **SnapCalorie**（YC出身） | 写真と深度センサーで量を推定 | 未確認 | 200万ドルを調達（2023-06）［40］ | 未確認 |
| **Fitia**（ペルー、YC S21） | AIで栄養を記録し献立を作る | 未確認 | 自社主張1,000万ユーザー［41］ | 2024年から米国へ展開［41］ |
| **Noom** | GLP-1 Companion | Microdose GLP-1Rx 初回119ドル、以後月199ドル（薬代込み、2025-08）［42］ | ― | GLP-1へ軸足を移している |
| **Dexcom Stelo**（CGM） | 写真で食事を記録（2025-07）。2026-02から100万品目のDBで栄養内訳を表示［43］ | ― | ― | 血糖と食事の連動 |
| Lifesum | ― | ― | 今回は未確認 | ― |

### 1-3 小売・デリバリーのAIアシスタント（エージェント型）

| 企業 | 時期と内容 | 指標 |
|---|---|---|
| **Instacart**（米） | 2025-12-08 ChatGPT内アプリ（初のInstant Checkout）［44］。2026-04 Claude［47］。2026-05-19 Gemini（例：「家族3人の平日夕食プラン」）［45］。2026-07-16 Google AI Mode［46］。2026-09-09 自社AI「Clementine」：予算、在庫、食事制限、手書きリストからカートを作り、好みを記憶［48］。小売向け白ラベル「Cart Assistant」も提供［48］ | Clementine利用者は1注文あたりの品数が増え、平均注文額は115ドル超［48］。2,200の小売、約10万店、2,200万SKU［45］ |
| **Walmart**（米） | 2025-06 Sparky開始。2026-10末に機能追加：リストや手書きメモからカート、レシピ生成からカート、健康的な代替提案、スペイン語・フランス語対応。音声は年内に全米［50］。ChatGPT・Geminiとも連携［50］ | Sparky利用者は1注文あたりの支出が40%多い（CEO、2026-08）。利用は開始以来70%増［50］ |
| **Kroger**（米） | 2026-01 Google「Gemini Enterprise for CX」の採用を発表［55］。2026-07-28 全バナーでAI Shopping Assistant：週間献立、予算・食事制限への対応、手書きリスト／レシピカード写真／URLからカート［54］ | 未公表 |
| **Albertsons**（米） | 2025-12-03 複数エージェント型のアシスタント：週間献立、食材の重複除去、写真からのレシピ取り込み、冷蔵庫・パントリーからの提案［56］。2026-08-05 SafewayのChatGPTプラグイン（決済は自社サイト）［57］。Mealimeを終了してMeals Hubに統合［22］ | 買い物時間が46分から4分に（自社主張）［56］ |
| **Tesco**（英） | 2026-04 社員28万人でベータ（社内チームと英Tomoro AIが開発）［58］［59］。残り物の活用による食品ロス削減を狙う［59］。2026年秋に顧客向け展開を始めたと報道（未確認）［60］ | ― |
| **Woolworths**（豪） | 2026-01 Olive を Gemini Enterprise でエージェント化。好みと特売から献立を作り、同意の上でカートに入れる［61］ | ― |
| **Shipt**（米） | 2025-10 Perplexity Cometで「Chat to Cart」［62］。2026-08 ChatGPT・Claude対応。2026-09-09 自社AI「Ask Shipt」［63］ | 100超の小売 |
| **HelloFresh**（独） | 2025年に7,000万ドルを投資し、機械学習の推薦を導入、週の選択肢を100品超に［64］。2025-11 AIでレシピカード制作を数か月から数時間に短縮［65］ | FY2025売上67.6億ユーロ（−11.8%）、注文1.005億件（−12.3%）、2026年も減収を見込む［66］ |

### 1-4 汎用AI・プラットフォーム

| 名称 | 動き（時点） |
|---|---|
| **ChatGPT**（OpenAI） | 2025-09-29 Instant Checkout（ACP、Stripeと共同）［53］。2025-12 Instacartアプリ［44］。2026-03 Instant Checkoutを終了し、アプリと加盟店側の決済に切り替え。Shopifyの参加は約30店にとどまった［51］［52］。利用実態：2025年7月時点で世界の成人の約1割が利用。「情報探索」は全体の24%に伸び、そこに含まれる「料理・レシピ」は図からの読み取りで全体の約0.9%（二次情報）［76］ |
| **Google**（Gemini／AI Mode） | 2025-11-13 検索とAI Modeでエージェント型チェックアウト（Google Pay、最終確認は利用者）。AI Modeにスポンサー枠を導入［73］。2026-01 NRFで「UCP」を発表［75］。2026-02-25 Geminiのタスク自動化をベータ公開（DoorDash、Instacart、Uber Eatsなど、Pixel 10／Galaxy S26、米韓）［74］ |
| **Amazon Alexa+** | 2025-03 早期アクセス：Fresh／Whole Foodsで注文、レシピや食事制限を記憶［71］。2026-02-04 米国の全ユーザーに提供。Prime会員は無料、非会員は月19.99ドル。利用者は「数千万人」、ベータ中のレシピ利用は5倍［70］。Alexa.comで1週間分の献立からカートを作れる（報道、日付未確認）［72］ |
| **Meta Muse** | 2026-09-08 米国で開始。Instagramに保存したレシピ動画から買い物リストを作り、来客の食事制限を覚えておく［33］。有料プランは月20／100ドル（報道、未確認）［34］ |
| **Perplexity／Claude** | Perplexity：CometでShiptのカートを作れる（2025-10）［62］。Claude：Instacart（2026-04）、Shipt（2026-08）のコネクタ［47］［63］ |

### 1-5 家電・スマートキッチン

| 名称 | 動き |
|---|---|
| **Samsung Bespoke AI Family Hub** | 従来のAI Visionは生鮮37種と登録済み加工品50種を認識［4］。CES 2026でGeminiとの連携を発表［4］。2026-05に米国の一部機種で認識対象を約100から2,000品目超に拡大し、2026年中に段階展開する［3］ |
| **Thermomix TM7／Cookidoo**（独Vorwerk） | TM7の米国予約価格は1,699ドル（2025-09）［68］。2025-12-02「Cookidoo Assistant」を発表：会話でレシピを探し、手持ちの食材を使い切ってロスを減らす。ドイツで始め、欧州6か国で試験。ガイド付きレシピは10万件超［67］ |
| **GE Appliances Flavorly AI** | 2023-08、Google Vertex AIを使ったレシピ生成。GE家電がなくても使え、Kroger・Instacartとつながる［69］ |
| **Skylight Calendar** | 家庭用ディスプレイのSidekickでAI献立（Plus 年79ドル）。レビューでは精度に課題が指摘されている（レビュー記事ベース）［32］ |

### 1-6 終了・買収・方針転換（年表）

- 2024-04：WhirlpoolがYummlyのチーム全員を解雇［89］。2024-12-20にYummly終了。2017年の買収前の直近評価額は1億ドル［18］［94］
- 2025-02-12：MyFitnessPalがIntentを買収［35］
- 2025-07-01：PlateJoy終了。**競合ブログの主張で、一次情報では未確認**［90］
- 2025-12：MFPがCal AIの買収を完了（発表は2026-03-02）［36］
- 2026-03：OpenAIがInstant Checkoutを終了［51］
- 2026-10-21：Mealime終了。2021年に取得したAlbertsonsのMeals Hubへ移行し、個人データは削除。告知にエクスポートの記載はない［22］［23］
- 2026-11-06：Ollie終了。2026-09にKhosla主導で750万ドルのシードを調達してから約2か月。CEOは「Muse、Instinctなどが参入し、目立つことも成長も資金調達も難しくなった」と述べた［24］［25］［26］。App Storeのページも削除されている（2026-11-08確認）

## 2. トレンド（2024〜2026）

| トレンド | 代表例（時点） | 根拠・数字 |
|---|---|---|
| **エージェント型（献立→カート）** | Instacart Clementine、Walmart Sparky、Kroger、Albertsons、Tesco、Woolworths、Ask Shipt | 注文額が増える：Walmartは+40%、Clementineは平均115ドル超［48］［50］。一方でAI内の決済は後退：OpenAIの撤退［51］、Woolworthsは慎重姿勢［61］、Googleは購入前に利用者の確認を求める［73］ |
| **会話型UI、汎用AI経由の流入** | ChatGPT、Claude、Gemini、AI Mode、Alexa+、Muse上のInstacart・Shipt・Safeway | Alexa+でレシピ利用が5倍［70］。ChatGPTの料理・レシピは全体の約0.9%だが母数が巨大［76］ |
| **SNS動画からのレシピ取り込み** | ReciMe、Pestle、Honeydew、Mela 2.5（動画の説明文から取り込む方式）［14］、Deglaze（映像解析と主張）、Meta Muse | SNS利用者の50%が料理アイデアを最もSNSに頼る（米英豪2,280人、2025-04〜05）［77］。Z世代の45%が直近に試した新しいレシピでSNSの影響を受けた（2025-01〜02）［78］ |
| **写真による在庫・食材認識** | Samsungの冷蔵庫（2,000品目）［3］。Samsung Food+は購入品の自動登録と期限通知［1］。手書きリストからカート（Kroger、Walmart、Instacart）。レシピ写真の取り込み（Albertsons） | ［54］［50］［48］［56］ |
| **栄養パーソナライズ（GLP-1、高たんぱく、CGM）** | Noom［42］、MyNetDiaryのGLP-1 Companion［93］、Menu-Order AI（4.5か月で11万DL、自社発表）［92］、Dexcom Stelo［43］、HelloFreshのHigh Protein［64］ | GLP-1利用者の71%が高たんぱく食品の購入を増やした（ベンダー調査）［91］。Health & Fitnessアプリの課金は2025年に45億ドル（+13%）、28%がAI関連キーワードを使用［38］ |
| **スマートキッチン連携** | Samsung、Thermomix、GE | 1-5参照 |
| **音声・ハンズフリー** | Alexa+、Walmart（年内に音声）、Albertsons（2026年に音声を予定）、Paprikaの音声調理モード | ［70］［50］［56］［17］ |
| **食品ロス削減** | Tescoの残り物活用、Cookidoo Assistant、Samsungの期限通知 | UNEP：2022年の食品廃棄は10.5億トン、うち家庭が60%（6.31億トン）、家庭だけで1日10億食分［80］ |
| **物価高への対応** | 予算と特売に連動（Kroger、Woolworths、Instacart、Walmart） | USDA（2026-02）：2026年は家庭内食品+2.5%、外食+3.7%、牛肉+5.5%［81］。HelloFreshは「米国人の85%が経済的な理由で自炊している」と引用［64］ |
| **家族共有・家庭OS** | Ollie（終了）、Skylight、Meta Muse、AnyListとPlan to Eatの世帯共有、Shiptの共有リスト（予定）［63］ | 汎用エージェントの参入で単体アプリは苦戦（Ollie）［25］ |
| **（供給側）AI検索とレシピ制作者** | Google AI Overviews／AI Mode | フードブロガー22人への取材で、流入が30〜80%減。複数レシピの手順を誤って混ぜる「Frankenstein recipes」の問題も［79］ |

## 3. 市場・ビジネスモデル

### 3-1 市場規模（推計のばらつきが大きい）

| 市場の定義 | 調査会社（更新日） | 規模 | 年成長率 |
|---|---|---|---|
| 献立アプリ | SNS Insider（2026-10-29） | 2025年14.7億ドル → 2035年38.7億ドル。うち米国5.66億ドル。サブスクが収益の68%［82］ | 10.2% |
| 献立アプリ | Intel Market Research（2026-07-31） | 2025年3.8億ドル → 2034年12.5億ドル［83］ | 約14% |
| 献立アプリ | Deep Insights Research | 2025年4.14億ドル → 2032年9.59億ドル（検索結果の要約、原文は未確認）［84］ | 12.7% |
| レシピアプリ | Straits Research（2026-10-13） | 2025年64.1億ドル → 2034年157.7億ドル。無料アプリが72.6%［85］ | 10.5% |
| レシピアプリ | DataHorizzon／Market.us | 2024年46億ドル→2033年112億ドル／2023年6.7億ドル→2033年22.7億ドル（いずれも要約、未確認）［86］［87］ | 10.3%／13.5% |
| 食品・飲料分野のAI（産業全体） | BCC Research（2025-11-04） | 2024年108億ドル → 2030年506億ドル［88］ | 29.6% |
| （参考）Health & Fitnessアプリの課金 | Sensor Tower（2026-02） | 2025年45億ドル（+13%）、DLは39.6億件（+0.8%）［38］ | ― |

注：同じ「献立アプリ」でも約4倍、「レシピアプリ」では約10倍の差がある。定義（広告、レシピサイト、栄養アプリを含めるか）によるもので、規模は方向感を見る程度にとどめるべき。

### 3-2 価格帯（米国、2026-11時点）

- **年10〜25ドル**：AnyList（9.99／14.99ドル）［19］、Pestle（24.99ドル）［12］
- **月3〜7ドル（年30〜60ドル）が主流**：Samsung Food+（6.99ドル／59.99ドル）［2］、Honeydew（6.99ドル／39.99ドル）［13］、Plan to Eat（5.95ドル／49ドル）［18］、ReciMe（29.99〜59.99ドル）［8］、Eat This Much（5〜14.99ドル）［21］、Mealime Pro（終了前は月2.99ドル）［22］
- **高価格帯**：MyFitnessPal Premium+ 年99.99ドル［35］、DishGen 年79.99ドル［27］、Skylight Plus 年79ドル［32］、Alexa+ 月19.99ドル（Prime会員は無料）［70］、Noom GLP-1Rx 月199ドル［42］、TM7本体1,699ドル［68］

### 3-3 収益モデル

- **サブスク（フリーミアム）**：主流。献立アプリ市場の収益の68%を占める（SNS Insider推計）［82］。Paprikaは買い切りからサブスクへ移った［17］。Pestleは買い切りも併売［12］
- **送客・手数料**：OpenAIはInstacartの売上から少額の手数料を取る想定［44］。ReciMeはアプリ内で宅配を注文できる［8］
- **リテールメディア**：Instacartの「広告等」収入は2025年に10.65億ドル（+11%）で、総売上37.4億ドルのうち（二次情報）［49］。Google AI Modeにもスポンサー枠ができた［73］。SideChefは注文単位の広告［29］
- **B2B・白ラベル**：InstacartのCart Assistant（Food Bazaar、Woodman'sなど）［48］、SideChef［29］
- **小売に吸収されるリスク**：MealimeはAlbertsonsに取得され、最終的にアプリが閉鎖された［22］
- **ハード・医療と組み合わせる**：Samsung（家電）、Thermomix（本体＋Cookidoo）、Noom・Dexcom（GLP-1、CGM）

### 3-4 資金調達とM&A

Jow（2021年に2,000万ドル、2024-02に1,300万ドルを追加）［31］。ReciMe（2024年にA$150万）［9］。SnapCalorie（2023-06に200万ドル）［40］。Ollie（2026-09に750万ドル、2か月後に閉鎖）［24］［26］。MFPによるIntent買収（2025-02）とCal AI買収（2025-12）［35］［36］。Whirlpool→Yummly（2017年買収、2024年閉鎖）［94］［18］。Albertsons→Mealime（2021年、2026年閉鎖）［22］。本調査で確認できた範囲では、2025〜26年の目立った動きはスタートアップへの大型投資より「大手による買収と吸収」だった。

## 4. 人気指標（公開範囲）

| 指標 | 内容（時点） |
|---|---|
| 米Food & Drinkの課金上位（Sensor Tower、アプリ内課金ベース、全OS合算、2025Q3） | 1. ReciMe（週次売上ピーク約52.5万ドル）、2. NYT Cooking（ピーク10.7万ドル、アクティブ167万）、3. America's Test Kitchen（約3万ドル）、4. Vivino、5. Seed Oil Scout［5］ |
| 同（2025Q4） | ReciMeの週次売上は54.3万ドルから15.9万ドルに低下（アクティブの数え方が四半期で違う可能性あり）。NYT Cookingは年末にピーク38.2万ドル、アクティブ130万→190万［6］ |
| 米Food & DrinkのDL上位（2025Q3） | DoorDash、McDonald's、Taco Bell、Uber Eats、Domino's。レシピ系は入らない［7］ |
| Health & Fitness | MyFitnessPalの米iOS週次売上ピーク約280万ドル（2025年12月末）［39］。Cal AIはAI関連キーワードがカテゴリ最多で、検索経由DLの25%がAI関連ワード由来［38］ |
| App Store（2026-11-08閲覧） | ReciMeはFood & Drink無料11位（評価33万件）［8］。Cal AIはHealth & Fitness無料13位（37.5万件）［37］ |
| 「急成長」報道 | Cal AI（2年弱で1,500万DL）［36］、Alexa+（数千万人）［70］、ReciMe（2023年に2万→40万ユーザー）［9］ |

読み取り：DLの上位は外食・宅配アプリが占めるが、課金ではレシピの保存・献立アプリが首位を取れている。ReciMeは課金上位でありながら、公表されている調達額は小さい（2024年時点でA$150万）［9］。少額の調達でも収益化できる領域だといえる。

## 企画への示唆

1. **汎用の「AI献立生成」では勝てない。** 大手小売と汎用AIが、多くは追加料金なしで同じ機能を提供しはじめた（MealimeとOllieの閉鎖、Muse・Clementineの登場）。差別化の軸は3つ：家庭固有の文脈を蓄積すること（家族の好み、アレルギー、在庫、過去の成功と失敗）、作るところまで支えること（段取り、時短、残り物）、地域の価格・特売データとつなぐこと。
2. **決済は抱えない。** OpenAIの撤退とWalmartのコンバージョンの数字が示すとおり、「AIはカートを作るまで、確定は既存EC」が現実解。日本向けならネットスーパー、生協、ECにカートを渡す設計にする（日本の連携先は別担当の調査と突き合わせる）。
3. **最初の価値は「SNS・動画で見たレシピの保存→献立→買い物リスト」。** 課金が実証済みの領域で（ReciMe、Pestle、Honeydew）、日本でもInstagram、TikTok、YouTube、レシピサイトからの取り込み精度（音声やテロップの解析）を中核機能にする価値がある。
4. **写真入力は前提とし、在庫を継続して把握することで差をつける。** 冷蔵庫、手書きメモ、チラシ、レシピカードの写真入力は各社が標準装備しつつある。使い切り、期限、残り物まで追えれば、食品ロス削減と節約という分かりやすい価値になる（家庭の食品ロスは世界の廃棄の60%［80］）。
5. **LLMの幻覚を外部の事実で抑える。** レシピ、栄養DB、価格・在庫はLLMの外にある検証済みデータに頼る。Google AI Modeのレシピ合成はブロガーとの摩擦と信頼の問題を生んだ［79］。出典リンクや制作者への還元も設計に入れる。
6. **栄養は「速さと正確さ」を選べる二層にする。** Cal AI（速さ）とMFP（DB・正確さ）が並存しているのが実例［36］。日本向けには減塩、子ども、高齢者、アレルギー、たんぱく質などの軸が有力（GLP-1・CGM連携は将来の拡張）。
7. **価格は海外相場を目安に。** 海外は月3〜7ドル（年30〜60ドル）が中心帯。日本での価格は別担当の調査と突き合わせて決める。サブスクに加え、小売への送客・リテールメディア、B2Bの白ラベル（Instacart Cart AssistantやSideChef型）という出口を最初から用意しておく。ただし小売に吸収されると独立したアプリは消えうる（Mealime）。
8. **汎用AIの中から使われる前提で作る。** 自社アプリに加え、ChatGPTアプリやMCPコネクタからも同じ献立・在庫データを使えるようにする（Instacart、Shipt、Safewayが実践している）。入口は汎用AIに取られやすいため、蓄積した家庭データとその継続性で勝負する。
9. **継続利用のカギは家族と調理中の体験。** 共有リスト、家族ごとの役割分担、調理中の音声ガイド。Alexa+ではベータ中にレシピ利用が5倍になった［70］。
10. **家電連携は後回しでよい。** ただし冷蔵庫の在庫データ（Samsung）や調理家電へのレシピ転送（Thermomix）につなげるAPI設計は、将来の拡張として残しておく。

## 出典一覧

1. Samsung Newsroom UK「Upgraded Samsung Food Raises the Bar…IFA 2024」2024-09-05 https://news.samsung.com/uk/upgraded-samsung-food-raises-the-bar-for-food-experiences-at-ifa-2024
2. App Store「Samsung Food: Meal Planner」（2026-11-08閲覧）https://apps.apple.com/us/app/whisk-recipes-grocery-list/id1133637674
3. Shopifreaks「Samsung expands food recognition … from 100 to 2,000 items via Google Gemini」2026-05-11 https://www.shopifreaks.com/samsung-expands-food-recognition-on-its-bespoke-ai-smart-refrigerators-from-100-to-2000-items-via-google-gemini-integration/
4. Samsung Newsroom「Samsung To Unveil AI Vision Built With Google Gemini at CES 2026」2025-12 https://news.samsung.com/uk/samsung-to-unveil-ai-vision-built-with-google-gemini-at-ces-2026
5. Sensor Tower「2025 Q3 Unified Top 5 Food and Drink Revenue US」https://sensortower.com/blog/2025-q3-unified-top-5-food%20and%20drink-revenue-us-602e0a75241bc16eb808976d
6. Sensor Tower「2025 Q4 Unified Top 5 Food and Drink Revenue US」https://sensortower.com/blog/2025-q4-unified-top-5-food-and-drink-revenue-us-602e0a75241bc16eb808976d
7. Sensor Tower「2025 Q3 Unified Top 5 Food and Drink Units US」https://sensortower.com/blog/2025-q3-unified-top-5-food%20and%20drink-units-us-602e0a75241bc16eb808976d
8. App Store「ReciMe: Recipes & Meal Planner」（2026-11-08閲覧）https://apps.apple.com/us/app/id1593779280
9. SmartCompany「Aussie cooking app ReciMe … $1.5 million seed round」2024 https://www.smartcompany.com.au/startupsmart/news/aussie-cooking-app-startup-recime-raises-1-5-million-seed/ ／同「ReciMe sizzles, jumping from 20,000 to 400,000 users in 2023」https://www.smartcompany.com.au/startupsmart/news/recime-sizzles-jumping-20000-400000-users-in-2023/
10. TechCrunch「Pestle's app can now save recipes from Reels using on-device AI」2024-07-08 https://techcrunch.com/2024/07/08/pestles-app-can-now-save-recipes-from-reels-using-on-device-ai
11. TechCrunch「Pestle recipe app can now save dishes from TikTok」2024-11-25 https://techcrunch.com/2024/11/25/pestle-recipe-app-can-now-save-dishes-from-tiktok
12. App Store「Pestle: Recipe Manager」（2026-11-08閲覧）https://apps.apple.com/us/app/id1574776971
13. App Store「Honeydew: Recipe & Cookbook AI」（2026-11-08閲覧）https://apps.apple.com/us/app/-/id6714449541
14. MacStories「Mela 2.5 Adds Web Search Engine and Recipe Import from YouTube, Instagram, and TikTok Videos」（日付未確認）https://www.macstories.net/reviews/mela-1-6-adds-web-search-engine-and-recipe-import-from-youtube-instagram-and-tiktok-videos/
15. RecipeSage（競合による比較）https://recipesage.com/alternatives/flavorish/ ／ https://recipesage.com/alternatives/crouton/
16. Deglaze（自社）「Save recipes from TikTok」https://www.deglaze.app/how-to/save-recipes-from-tiktok
17. Paprika公式（2026-11-08閲覧）https://www.paprikaapp.com/
18. Plan to Eat「Yummly is closing…」2024-12-02 https://www.plantoeat.com/blog/2024/12/yummly-is-closing-discover-the-best-meal-planning-alternative/
19. AnyList Complete（2026-11-08閲覧）https://www.anylist.com/complete
20. GitHub mealie-recipes/mealie（2026-11-08閲覧）https://github.com/mealie-recipes/mealie ／ Mealie Docs（OpenAI）https://docs.mealie.io/documentation/getting-started/installation/open-ai
21. Eat This Much Help https://help.eatthismuch.com/help/what-do-i-get-for-subscribing ／ App Store https://apps.apple.com/us/app/eat-this-much-meal-planner/id981637806
22. Mealime 閉鎖告知（2026-11-08閲覧）https://www.mealime.com/closing ／ App Store（Pro 月2.99ドル、検索結果ベース）https://apps.apple.com/US/app/id1079999103
23. Business Wire「Albertsons…Meal Planning Solutions」2021-12-14 https://www.businesswire.com/news/home/20211214005922/en
24. American Bazaar「San Diego AI startup Ollie secures $7.5 million in seed funding」2026-09-08 https://americanbazaaronline.com/2026/09/08/san-diego-ai-startup-ollie-secures-7-5-million-in-seed-funding-487752/
25. AI Weekly「Ollie to Shut Down Nov 6, Weeks After $7.5M Khosla Seed」2026-10-31（TechCrunch 2026-10-30の報道を引用）https://aiweekly.co/alerts/ollie-to-shut-down-nov-6-weeks-after-75m-khosla-seed
26. Ollie「Farewell」https://ollie.ai/farewell
27. App Store「DishGen: AI Recipes」https://apps.apple.com/us/app/id6473455744
28. Mr. Cook「ChefGPT vs. DishGen」（競合による比較）https://www.mrcook.app/en/compare/chefgpt-vs-dishgen
29. Business Wire「SideChef Announces RecipeGen AI」2024-08-06 https://www.businesswire.com/news/home/20240806193505/en/SideChef-Announces-RecipeGen-AI ／ SideChef for Retailers https://business.sidechef.com/insights/solutions-for-retailers
30. Business Wire「BuzzFeed's Tasty Introduces Botatouille」2023-05-23 https://www.businesswire.com/news/home/20230523005505/en/
31. tech.eu「Jow's bespoke menu app attracts $13M investment for US expansion」2024-02-08 https://tech.eu/2024/02/08/jows-bespoke-menu-app-attracts-13m-investment-for-us-expansion/
32. Digital Trends「Skylight AI assistant Sidekick」（日付未確認）https://digitaltrends.com/home/skylight-ai-assistant-sidekick-meal-prep
33. Meta「Introducing Muse」2026-09-08 https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/
34. TechCrunch（Museの価格、本文は未取得）2026-09 https://techcrunch.com/?p=3161372
35. Athletech News「MyFitnessPal acquires Intent」2025-02-12 https://athletechnews.com/myfitnesspal-acquires-intent-adds-personalized-meal-planning/
36. TechCrunch「MyFitnessPal has acquired Cal AI」2026-03-02 https://techcrunch.com/2026/03/02/myfitnesspal-has-acquired-cal-ai-the-viral-calorie-app-built-by-teens
37. App Store「Cal AI - Calorie Tracker」（2026-11-08閲覧）https://apps.apple.com/us/app/id6480417616
38. Sensor Tower「AI drives revenue surge in health & fitness apps」2026-02 https://sensortower.com/blog/health-and-fitness-apps-ai
39. Sensor Tower「2025 Q4 iOS Top 5 Health and Fitness Revenue US」https://sensortower.com/blog/2025-q4-ios-top-5-health-and-fitness-revenue-us-600af518241bc16eb8dce802
40. TechCrunch（SnapCalorie、検索結果ベース）2023-06 https://techcrunch.com/?p=2561037
41. Fitia「About」https://fitia.app/about/ ／ yespress「Fitia YC S21」https://yespress.io/fitia-yc-s21
42. Athletech News「Noom launches $119 microdose GLP-1 program」2025-08 https://athletechnews.com/noom-launches-119-microdose-glp-1-weight-loss-program/
43. Dexcom IR 2025-07-28 https://investors.dexcom.com/news/news-details/2025/Dexcom-Launches-Revolutionary-AI-Powered-Meal-Logging-Feature-Across-Glucose-Biosensing-Portfolio/default.aspx ／ 2026-02-04 https://investors.dexcom.com/news/news-details/2026/Stelo-Adds-Enhanced-Smart-Meal-Logging-Features-as-Dexcom-Continues-to-Transform-Personal-Glucose-Management/default.aspx
44. TechCrunch「You can buy your Instacart groceries without leaving ChatGPT」2025-12-08 https://techcrunch.com/2025/12/08/you-can-buy-your-instacart-groceries-without-leaving-chatgpt
45. Instacart「Instacart Brings Agentic Grocery Shopping to Gemini」2026-05-19 https://company.instacart.com/updates/instacart-brings-agentic-grocery-shopping-to-gemini
46. Instacart「Instacart integrates with AI Mode in Google Search」2026-07-16 https://company.instacart.com/updates/instacart-integrates-with-ai-mode-in-google-search
47. Technobezz「Instacart launches … inside Anthropic's Claude」2026-04-27 https://www.technobezz.com/news/instacart-launches-grocery-delivery-service-inside-anthropics-claude-chatbot
48. Digital Commerce 360「Instacart AI assistant Clementine」2026-09-09 https://www.digitalcommerce360.com/2026/09/09/instacart-ai-assistant-clementine-agentic-commerce-integrations/
49. Sacra「Instacart」（FY2025、二次情報）https://sacra.com/research/instacart ／ Tiger Brokers（Reuters、Q4 2025）https://www.itiger.com/news/2611497092
50. Retail Dive「Walmart Sparky features」2026-11-05 https://retaildive.com/news/walmart-sparky-features-AI-holidays/873718
51. CNBC「OpenAI's first crack at online shopping stumbled」2026-03-20 https://www.cnbc.com/2026/03/20/open-ai-agentic-shopping-etsy-shopify-walmart-amazon.html
52. Digital Commerce 360「OpenAI reveals updates to its agentic commerce experience」2026-03-24 https://www.digitalcommerce360.com/2026/03/24/openai-agentic-commerce-updates-chatgpt-walmart/
53. TechCrunch「OpenAI takes on Google, Amazon with new agentic shopping system」2025-09-29 https://techcrunch.com/2025/09/29/openai-takes-on-google-amazon-with-new-agentic-shopping-system
54. Kroger「Kroger helps families simplify back-to-routine season…」2026-07-28 https://www.thekrogerco.com/ir-feed-item/kroger-helps-families-simplify-back-to-routine-season-with-fresh-convenient-meals-and-a-smarter-way-to-shop/
55. Google Cloud「Kroger Scales Generative AI Strategy with Google Cloud」2026-01-11 https://www.googlecloudpresscorner.com/2026-01-11-Kroger-Scales-Generative-AI-Strategy-with-Google-Cloud-to-Drive-Digital-Growth-and-Personalization
56. Idaho Business Review「Albertsons brings agentic AI into grocery shopping」2025-12-03 https://idahobusinessreview.com/2025/12/03/albertsons-ai-shopping-assistant-launch/
57. The Shelby Report「Albertsons Cos. launches Safeway plugin in ChatGPT」2026-08-05 https://theshelbyreport.com/2026/08/05/albertsons-cos-launches-safeway-plugin-in-chatgpt/
58. PYMNTS「Walmart, Tesco and Albertsons Turn Dinner Questions Into Instant Carts」2026-04-13 https://www.pymnts.com/?p=3649597
59. Grocery Gazette「Tesco trials AI shopping assistant with 280,000 colleagues」2026-04-09 https://www.grocerygazette.co.uk/2026/04/09/tesco-trials-ai-shopping-assistant-with-280000-colleagues-ahead-of-customer-rollout/
60. Newswav「Tesco rolls out AI customer assistant following trial」2026-10（検索結果ベース）https://newswav.com/article/tesco-rolls-out-ai-customer-assistant-following-trial-A2610_klk3Nh
61. Inside Retail「Woolworths teams up with Google AI」2026-01-13 https://insideretail.com.au/digital/ai/woolworths-teams-up-with-google-ai-in-global-game-changer-202601
62. Shipt「Introducing Shipt's new Chat to Cart feature」2025-10-02 https://corporate.shipt.com/news/introducing-shipt-s-new-chat-to-cart-feature
63. Shipt「…new AI experiences in ChatGPT and Claude」2026-08-18 https://corporate.shipt.com/news/shipt-advances-agentic-shopping-with-new-ai-experiences-in-chatgpt-and-claude ／「Meet Ask Shipt」2026-09-09 https://corporate.shipt.com/news/meet-ask-shipt-shipt-s-new-ai-shopping-assistant
64. Prepared Foods「HelloFresh invests $70M in product innovation…」2025-08-10 https://www.preparedfoods.com/articles/130789-hellofresh-invests-70m-in-product-innovation-to-expand-menu-boost-personalization
65. Business Wire「HelloFresh Harnesses AI to Accelerate Delivery of Chef Created Recipes」2025-11-06 https://www.businesswire.com/news/home/20251106923790/en/
66. RTTNews「HelloFresh FY25 Net Loss Narrows…」2026-03-18 https://www.rttnews.com/3631623/hellofresh-fy25-net-loss-narrows-revenues-orders-down-warns-on-fy26.aspx
67. Vorwerk「Cookidoo: KI-gestützter Kochassistent」2025-12-02 https://www.vorwerk.com/de/de/c/home/allgemein/presse/pressemitteilungen-thermomix/cookidoo-ki-gestuetzter-kochassistent-cookidone
68. HomePage News「Thermomix launches TM7 … in U.S.」2025-09-02 https://www.homepagenews.com/home-housewares/thermomix-launches-tm7-multi-function-appliance-in-u-s/
69. Google Cloud「GE Appliances … Personalized Recipes…」2023-08-29 https://www.googlecloudpresscorner.com/2023-08-29-GE-Appliances-Helps-Consumers-Create-Personalized-Recipes-From-the-Food-in-Their-Kitchen-with-Google-Clouds-Generative-AI
70. TechCrunch「Alexa+ … now available to everyone in the U.S.」2026-02-04 https://techcrunch.com/2026/02/04/alexa-amazons-ai-assistant-is-now-available-to-everyone-in-the-u-s/
71. Grocery Dive（Alexa+と食品）2025-03-05 https://www.grocerydive.com/news/amazon-alexa-grocery-technology-digital-whole-foods/741623/
72. Chain Store Age（Alexa.comの献立・買い物、日付未確認）https://chainstoreage.com/amazon-integrates-instant-meal-shopping-browser-based-alexa-model
73. TechCrunch「Google expands AI shopping … agentic checkout」2025-11-13 https://techcrunch.com/2025/11/13/google-expands-ai-shopping-with-conversational-search-agentic-checkout-and-an-ai-that-calls-stores-for-you
74. TechCrunch「Gemini can now automate some multi-step tasks on Android」2026-02-25 https://techcrunch.com/2026/02/25/gemini-can-now-automate-some-multi-step-tasks-on-android
75. Google「NRF 2026 remarks」2026-01（検索結果ベース）https://blog.google/company-news/inside-google/message-ceo/nrf-2026-remarks/
76. Chatterji et al.「How People Use ChatGPT」2025-09-15 https://www.nber.org/papers/w34255
77. Sprout Social（プレスリリース）2025-05-29 https://sproutsocial.com/insights/press/new-research-from-sprout-social-finds-social-media-is-the-top-place-gen-z-turns-to-for-search-surpassing-traditional-search-engines/
78. Morning Consult「Gen Z, social media, restaurants & recipes」2025-07-02 https://intel.morningconsult.com/mc-content/analysis/gen-z-social-media-restaurants-recipes
79. Fortune（Bloomberg）「AI slop recipes … food blog collapse」2025-11-26 https://fortune.com/2025/11/26/ai-slop-recipes-thanksgiving-food-blog-collapse-traffic
80. UN News（UNEP Food Waste Index Report 2024）2024-03 https://news.un.org/en/node/1148036 ／ IISD https://sdg.iisd.org/news/one-fifth-of-all-food-wasted-while-783-million-go-hungry-unep-report/
81. Grocery Dive「Food-at-home prices increase 2026（USDA）」2026-02 https://www.grocerydive.com/news/food-at-home-prices-increase-2026-usda/813359/
82. SNS Insider「Meal Planning App Market」2026-10-29更新 https://www.snsinsider.com/reports/meal-planning-app-market-11549
83. Intel Market Research「Meal Planning App Market」2026-07-31更新 https://www.intelmarketresearch.com/meal-planning-app-market-346
84. Deep Insights Research（MarketResearch.comに掲載、検索結果ベース）https://www.marketresearch.com/Deep-Insights-Research-Co-DIR-v4285/Global-Meal-Planning-App-Research-41703621
85. Straits Research「Recipe Apps Market」2026-10-13更新 https://straitsresearch.com/report/recipe-apps-market
86. DataHorizzon Research（検索結果ベース）https://datahorizzonresearch.com/global-recipe-apps-market-59302
87. Market.us「Recipe App Market」（検索結果ベース）https://market.us/report/recipe-app-market
88. BCC Research「AI in Food and Beverage to Reach $50.6 Billion by 2030」2025-11-04 https://www.bccresearch.com/pressroom/ait/ai-in-food-and-beverage-to-reach-$506-billion
89. The Spoon「Whirlpool lays off entire team for cooking and recipe app Yummly」2024-04 https://thespoon.tech/whirlpool-lays-off-entire-team-for-cooking-and-recipe-app-yummly/
90. HowIEatHealthy（競合のブログ。PlateJoy終了の主張）https://howieathealthy-website.vercel.app/blog/platejoy-alternative-2026
91. Chicory「What GLP-1 users are actually buying」2026（ベンダー調査）https://chicory.co/blog-feed/what-glp-1-users-are-actually-buying
92. BriefGlance（Menu-Order AI、自社発表の転載）https://briefglance.com/articles/ai-dining-app-for-glp-1-users-crosses-110000-downloads-in-months
93. XPR Media（MyNetDiary GLP-1 Companion、プレスリリース）https://xpr.media/?p=778438
94. TechCrunch「Whirlpool acquires Yummly … last valued at $100M」2017-05-04 https://techcrunch.com/2017/05/04/whirlpool-acquires-yummly-the-recipe-search-engine-last-valued-at-100m/
95. SamMobile「Whisk app renamed Samsung Food」2023-08-31（検索結果ベース）https://www.sammobile.com/news/whisk-app-renamed-samsung-food/

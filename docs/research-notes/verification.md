# 数値の検証記録

- 実施日：2026年11月8日
- 方法：調査メモ01〜04の主張を節ごとに分け、別のエージェントが出典URLを取得して1件ずつ照合した。取得できない場合は別の一次情報を探した。
- 判定：「確認済み」＝出典に明記されている／「修正」＝出典はあるが数値・日付・名称などが違う／「出典で確認できず」＝出典に書かれていない／「出典に到達できず」
- 調査メモ本文は書き換えていない。レポート（[../research-report.md](../research-report.md)）と提案書には、ここでの修正を反映した。
- 追加調査のメモ05〜07は、この検証の対象外。

**全体**：729件を照合し、646件（88%）を確認できた。残り83件の内訳は以下。

## 01_japan.md（日本の生活者と国内アプリ）

照合 178件、確認済み 158件。

| 判定 | 箇所 | メモの記述 | 修正・補足 |
|---|---|---|---|
| 修正 | 1-2 1点目（括弧書き） | （エンゲル係数の数値は）おいしい健康のリリースが総務省家計調査を引用したもの | リリース本文には「総務省」「家計調査」などの出典表記がなく、数値と年だけが書かれている。一次資料の総務省統計局「家計調査 2024年 家計の概要」（二人以上の世帯）に差し替えるべき。同資料ではエンゲル係数28.3％、前年比+0.5pt https://www.stat.go.jp/data/kakei/2024np/pdf/summary.pdf （「43年ぶり」は同資料には書かれていない） |
| 出典で確認できず | 0. 要点 3点目 | 特売情報への需要も同時に強まっている | エンファム調査では、特売情報配信サービスが「助かるサービス」として99件挙がっているだけ。時系列で需要が強まったことを示すデータは[7][8]のどちらにもない |
| 出典で確認できず | 0. 要点 4点目（見出し部分） | 大手のAI対応は「保存・買い物リスト・相談」が中心で、献立を自動で組むLLM機能はまだ脇役 | 出典[9][10][11]は各社の個別機能を説明しているだけ。大手全体のAI対応の重心や「脇役」という評価はどこにも書かれておらず、メモ筆者の解釈 |
| 修正 | 1-1表 スナップディッシュ行 | 調理・片付けの時間はほぼ横ばい | 出典が「ほぼ横ばい」としているのは実際の所要時間ではない。「時短したい」料理家事として「調理・後片づけ・洗い物」を選んだ人の回答率（2019→2024年）のこと。正しくは「『調理・後片づけ・洗い物』を時短したい人の割合はほぼ横ばい」 https://dentsu-ho.com/articles/9478 |
| 修正 | 出典一覧[41]（§2表 クックパッド行の根拠） | 出典[41]の決算短信の日付は2026-02-05 | 決算短信の表紙の日付は「2026年２月６日」。株探の通期表でも2025.12期の発表日は2026-02-06（https://s.kabutan.jp/stocks/2193/finance/） |
| 出典で確認できず | §2表 me:new行・料金 | me:new有料版の旧価格は月額400円 | BI記事（2023-12-26）は「価格：無料」「利用は無料」とあるだけ。公式サイトとApp Store（https://apps.apple.com/jp/app/id977041956）にも有料版の料金は書かれていない。App Storeの版履歴に「新有料プラン（お試し版）」の言及があるが、料金の記載はない。WebSearchでも月額400円は見つからなかった |
| 修正 | §2表 味の素行 | ITmedia記事は文字化けでサービス名が読めず、同一サービスと推定 | ページはShift_JISで、CP932として復号すれば本文に「3月25日に味の素がリリースした「未来献立。」は、ユーザーに対し、最大で8日分の献立を提案するWebサービスだ」と明記されている。推定ではなく同一サービスと確定できる（正式表記は「未来献立。」）。根拠: https://www.itmedia.co.jp/business/articles/2408/02/news137.html |
| 出典で確認できず | §2表 味の素行／§3表 2024-03〜行（§5でも根拠として使用） | 未来献立は主菜・副菜・汁物（の組み合わせ）を、栄養を考慮して提案した | ITmediaの記事は「最大で8日分の献立」、栄養の偏りを補う「ツジツマあわせ」、彩りや品数のバランスを説明しているが、「主菜」「副菜」「汁物」の語はない。終了告知ページ（https://www.ajinomoto.co.jp/company/jp/rd/miraikondate/）も「栄養バランスの考えられた献立をまとめて提案」とあるだけ。栄養考慮の部分は裏付けられるが、主菜・副菜・汁物の単位は裏付けがない |
| 出典で確認できず | §3表 2025-12〜行 | おいしい健康が「LLMによる食事画像の解析」を提供（2025-12〜） | 2025-12-24のリリースにも、2026-02-04の記事（https://www.appbank.net/2026/02/04/iphone-news/2921571.php）にも「LLM」「大規模言語モデル」「写真」「生成AI」の語はなく、食事画像の解析の記述もない |
| 出典で確認できず | §3表 2025-06-25〜行 | レシピトークは主菜・副菜を提案する | DXマガジンの記事に「主菜」「副菜」の語はない。別の記事のImpress Watch（2025-06-26、https://www.watch.impress.co.jp/docs/news/2025909.html）には「計3,000件以上の中からAIが主菜や副菜を提案する」とあり、出典を差し替えれば裏付けられる |
| 出典で確認できず | §3表 2025-06-25〜行・価格・規模 | レシピトークの利用者数は非公表 | DXマガジンにもImpress Watchにも、利用者数への言及や「非公表」という記載はない。「記載なし」と書くのが正確。なおImpress Watchには「利用料は無料」とある |
| 修正 | §3表 2026-04-20〜行 | Agent iは「AIが生成・推定したレシピ」と明記（鉤括弧での引用） | 趣旨は正しいが、原文どおりの引用ではない。原文は「「レシピ」エージェントで提案されるレシピは、AIが画像から生成・推定した結果であり、特定のレシピサイトや店舗などの公式のレシピを提供・再現するものではありません。」。鉤括弧で引用するならこの文言を使う。根拠: https://www.lycorp.co.jp/ja/news/release/020565/ |
| 修正 | §3表 2026-06-03〜／2026-07-29〜行 | シャープ「クックトーク」（2026-06-03〜／2026-07-29〜）：食材から自動調理レシピを生成し、仕上がり時刻から下ごしらえの開始時刻を逆算、献立の相談にも応じる | 機能の内容はおおむね正しい。ただし6/3と7/29はニュースリリースの発表日。新機能の対象は新機種で（※3「2026年6月3日時点では＜AX-LSX3D＞＜AX-RS1D＞＜AX-N1D＞＜AX-U1D＞が対象」）、ヘルシオ新機種の発売は2026-06-18〜07-16、ホットクック（KN-HW24K/16K）の発売は2026-09-17。ホットクックで生成されるレシピは「自動調理には対応しておりません」（加熱は手動で設定）。また、クックトーク自体は6/3以前からヘルシオで提供されており、6/3の発表は機能の「進化」。根拠: https://corporate.jp.sharp/system/files/2026-06/260603-a.pdf 、https://corporate.jp.sharp/system/files/2026-07/260729-a_0.pdf |
| 修正 | 4. 生の声 表「分量のズレ」行 | 買い物リストではハム「4枚」なのに、レシピは「3〜4枚」 | レシピと買い物リストが逆。原文は「レシピでは『ハム:4枚』となっているのが買い物リストでは『ハム:3~4枚』となっていたり」（レシピ＝4枚、買い物リスト＝3〜4枚）。同じレビューは「タコ(ゆでダコを使用)」が買い物リストでは「タコ」だけになる例も挙げ、「週に1つはこの様な違いが生じます」と書いている。https://apps.apple.com/jp/app/id977041956?see-all=reviews |
| 修正 | 4. 生の声 表「減塩」行（後半） | 最近献立に入れたレシピがおすすめに出てくる（同レビュー。「減塩」の論点に好意的な声として並べている） | 好意的な声ではなく不満点。原文は「気になるところを言えば、おすすめで出てくるレシピがつい最近献立に入れたばかりのものが出てきたり（そんなにしょっちゅう同じもの食べたくない）すること。…ちょっと邪魔です」。論点は「減塩」ではなく「重複・マンネリ」に移すべき。https://apps.apple.com/jp/app/id1576492917?see-all=reviews |
| 修正 | 5. 表「主食・主菜・副菜・汁物の組み合わせ」行・根拠 | クラシル、デリッシュ、未来献立、me:newはどれも「主食・主菜・副菜・汁物」の単位で献立を組む | 4サービスが同じ単位という記述は不正確。クラシルは「主菜・副菜・汁物」[48]、デリッシュの「カスタム献立」も「主菜・副菜・汁物」[52]で、どちらも主食は含まない。me:newは[53]公式サイトに構成の記載がなく、App Store説明文（https://apps.apple.com/jp/app/id977041956）に「主食・主菜・副菜を基本とする夕食の献立」とあり、汁物は含まない。未来献立は[57]のITmedia記事にも味の素の発表（https://www.ajinomoto.co.jp/company/jp/presscenter/press/detail/2024_03_25_01.html）にも構成の記載がなく未確認。「主菜・副菜（・汁物）をセットで提案するのが主流」程度に改め、未来献立は外すか出典を補う。 |
| 修正 | 5. 表「作り置き・冷凍・まとめ買い」行・根拠 | 冷凍保存の検索が17倍 | 対象と比較基準が抜けている。正しくは「小松菜・ナス・ゴーヤなど手頃な野菜の冷凍保存検索が2015年比で平均約17倍（ゴーヤは約37倍）」。インゲン・里芋など、もともと冷凍できると知られた野菜の検索はほぼ横ばい。クックパッド自社の検索データ「たべみる」による（2025-10-24発表）。企画への示唆5の「冷凍保存の検索17倍」も同様に直す。https://resemom.jp/release/prtimes/20251024/160867.html |
| 修正 | 5. 表「家族構成・子ども・アレルギー」行・根拠 | 苦手食材やアレルギーの除外（me:new） | 内容は正しいが出典が違う。[53] menew.jp には「アレルギー」「苦手」の記載がない。App Store説明文（[18] https://apps.apple.com/jp/app/id977041956）に「【4】アレルギー食材や苦手な食材は含まない献立自動作成」とあるので、出典を[18]に差し替える。 |
| 修正 | 5. 表「計量・単位」行・根拠 | 大さじ・小さじと「1/4個」「40g」の混在への不満（クラシル） | レビュー（2022/04/11）が指摘しているのは「玉ねぎ1/4」と「玉ねぎ40g」の表記ゆれ（個数とグラムの混在）だけで、大さじ・小さじへの言及はない。「大さじ・小さじと」を削り、「『1/4』と『40g』の混在への不満」とする。https://apps.apple.com/jp/app/id1059134258?see-all=reviews |
| 出典で確認できず | 5. 表「時刻・段取り」行・根拠（出典番号なし） | 共働き家庭は夕方の負担が大きい | 行内に出典番号がなく、同じ行の[16]シャープのリリースにも共働き・夕方の負担の記述はない。根拠にするなら[1] AdverTimes（JR東日本企画、首都圏の共働き家庭）の「平日の夕食」に負担を感じる82.0%（前回比5.3pt減）https://www.advertimes.com/?p=518330 |

<details><summary>検証者の所見（出典の質、スポンサー、時点のずれなど）</summary>

**J1**

【結果】担当範囲（0. 要点、1-1〜1-5）から69件を検証した。supported 65件、corrected 2件、unsupported 2件、unreachable 0件。かぎ括弧付きの引用語句（「何を作るか・どう使うかを考えること」「今日のお昼ごはん何？」「毎日の献立を考えること」「メニューを考える」「献立の決定」「料理・献立決め」「食事の献立を考える」「名もなき家事」「価格の安さ」「できる限り楽しみたい」「食費を安くすることの方が重要」「ほとんど毎日」「受動的…迷いやすい」など）は15件以上、原文にあることを確かめた。

【修正が必要な点】
1. [23]電通報：メモの「調理・片付けの時間はほぼ横ばい」は誤読。出典がほぼ横ばいとしているのは、「時短したい家事」として「調理・後片づけ・洗い物」を選んだ人の回答率で、実際の所要時間ではない。
2. [6]おいしい健康：リリースは総務省家計調査を出典として示しておらず、数値と年だけが書かれている。28.3%は総務省「家計調査 2024年 家計の概要」（二人以上の世帯）の値と一致するので、出典はこの一次資料に差し替えるべき。「43年ぶり」は一次資料には書かれていない。
3. unsupportedの2件：要点3点目の「特売情報への需要が強まっている」は、時系列のデータがない（エンファム調査で「助かるサービス」として99件挙がっただけ）。要点4点目の「LLM献立は脇役」は、出典にない筆者の解釈。

【母数・設問の注意】
- [24]「献立の決定」53.1%は複数回答での1位。
- [26]トクバイの76.8%・70.0%・59.6%は、負担を感じている人が母数。
- [38]ベターホームの7.9%は、たんぱく質を意識している847人が母数で、全体1,124人比では約6%。
- [1]87.0%が「負担を感じる人」の中の割合かどうかは、記事に明記がない。
- [22]Nadiaの78.5%は見出しの数字で、本文は「約8割」。
- [15]Agent iはLINEだけでなくYahoo! JAPANアプリ・ブラウザでも提供されている。画像読み取り機能は、2026/6/25時点でLINEは「順次対応予定」だった。
- [17]献立AI Platは個人開発なので、「スタートアップ」と呼ぶのは言い過ぎ。また「小規模」の根拠はこの1件だけ。

【スポンサー・自社調査なのにメモに明記がないもの】
イングリウッド[24]は自社PRと明記済み。それ以外に次のものがある。
- 企業の自社PR調査：ナイル「ラクタさん」[21]（宅食比較メディア）、Nadia[22]（自社会員）、パナソニック[3][27][32]（家電メーカー）、AZWAY[25]（家電体験談サイト）、トクバイ[26]（自社利用者）、クックパッド「たべみる」[30]（自社検索データ）、おいしい健康[6]（自社AI機能の告知）、スナップディッシュ[23]（自社アプリ利用者、n不明、電通報経由の孫引き）
- 業界団体の調査：日本冷凍食品協会[35]
- 代表性のない便宜標本：エンファム[8]（イベント参加者、％ではなく件数）、ゼニエモン[31]（クラウドワークス登録者）、ベターホーム[38]（自社料理教室の受講生。1-4の「高齢者」の代表としては不適）
- 要点6点目の「不満の核」は、App Storeの個別レビュー数件とブログ2本が根拠で、定量データではない。

【出典の質】
- 多くの数値がCommercePick・財経新聞・リセマム・ネットショップ担当者フォーラムなどのPR TIMES転載に頼っている。最終レポートでは元のリリースか「〇〇調べ」として示すことを推奨する。
- 東洋経済は初回取得で広告ブロック検知が出て本文が取れず、?page=1で取得できた。AdverTimesの2ページ目は会員限定。PDF（大和ハウス、総務省、食育白書、消費者庁、ベターホーム、シャープ）はテキストを抽出して確認した。総務省の報道資料は文字化けしていたが、日付と公表予定は読み取れた。

【時点のずれ】
- 大和ハウス[28]は2017年（参考扱い）。社会生活基本調査[29]は2021年で、2026年調査の結果は2027年9月以降に公表予定。
- ナイル（2024年1月）、トクバイ（2024年8月）、Nadia（2024年9月）は2年前後古い。
- AIsmiley[40]の「約5,000施設」は2024年1月の記事で、基準日の記載がない。

【担当範囲外で気づいた点（参考）】
- 4章のme:newレビュー：メモは「買い物リストではハム4枚なのに、レシピは3〜4枚」と書いているが、原文は「レシピでは『ハム:4枚』となっているのが買い物リストでは『ハム:3~4枚』」で、向きが逆。
- リベシティの原文は「買いに行かなないやん」（誤字のまま）。

**J2**

【全体】§2・§3の主張は合計59件を確認した。53件はおおむね一次情報（決算短信、各社のリリース、App Store）で裏付けられた。App Storeの評価・件数・価格は、2026-11-08の取得時点ですべてメモと一致した。PDFはWebFetchで読めなかったため、pdftotextで本文を取り出して確認した。対象はクックパッドの決算短信2本とシャープのリリース2本。

【要修正（最終レポートに使う前に直すべき点）】
(1) 味の素「未来献立」が「主菜・副菜・汁物」を提案するという記述は、出典[57][58]にない。§5でも根拠に使っているので注意。
(2) おいしい健康の「LLMによる食事画像の解析」は、[6][59]のどちらにもない。
(3) me:new「有料版の旧価格は月額400円」は、[18][53][54]のいずれにもなく、検索でも見つからない。
(4) レシピトークの「主菜・副菜」は[14]にない。Impress Watch（2025-06-26、https://www.watch.impress.co.jp/docs/news/2025909.html）に差し替えれば裏付けられる。「利用者数は非公表」はどの記事にも根拠がないので、「記載なし」とするのが正確。
(5) シャープ「クックトーク」の6/3と7/29はリリースの発表日。新機種の発売は、ヘルシオが6/18〜7/16、ホットクックが9/17。ホットクックで生成したレシピは自動調理に対応しない。クックトーク自体は6/3より前から提供されている。
(6) 出典[41]の日付は2026-02-05ではなく2026-02-06。
(7) Agent iの「AIが生成・推定したレシピ」は原文どおりの引用ではない。
(8) ITmedia[57]はShift_JISとして読めば「未来献立。」と明記されている。「推定」の注記は外して、同一サービスと確定させてよい。

【スポンサー・自社発表】
- メモで明記済み：デリッシュの3,200万MAU（自社の主張、調査主体の記載なし）、ヨシケイの50万世帯、me:newの220万DL（公式サイト）。
- メモで未明記：
  - クラシルの4,400万DLは、dely自社のPR TIMESリリース。
  - おいしい健康[6][59]、エブリー[11][51]、キユーピー（DXマガジン[14]）は、いずれも自社発表がもと。
  - 献立AI PlatのDL数は、MWMによる推計値。
  - ミラLab[70]は、AI企業MiraLab.incのオウンドメディア（PR表記なし）。
  - ハウスケアラボ[20]は、株式会社アシストのオウンドメディア。
  - [42]もTDnetのミラー（ifis）だが、その旨の記載がない。株探[43]は二次情報。

【時点のずれ】
- クックパッドの料金は、App Storeの「月額400円（税込）」と報道の「月額550円」が並存している。App Storeの課金一覧には¥480・¥390などもある。
- クックパッドの3/19は、記事上は「発表」日。
- クラシルのSiri対応は、利用開始が10/26、発表が11/2。
- 未来献立の公開日は2024-03-25。

【担当外で気づいた点】
- [19]の原文は「いや、それ買いに行かなないやん」で、原文側の誤字。§4はこれを断りなく直して引用している。
- [6]のリリースは、エンゲル係数28.3%の出典として総務省家計調査を挙げていない。§1-2の「総務省家計調査を引用」という記述とずれている。
- [48]の「玉ねぎ1/4」レビューは、App Storeの製品ページに表示されるレビューの中には見当たらなかった（レビュー一覧のページは未確認）。

**J3**

【到達状況】担当範囲の50件（4章の引用19件、5章の表の数値・事実31件）は、すべて出典本文で確認できた。WebFetchで読めなかったPDF（食育白書、シャープ、消費者庁、ベターホーム）はcurlとpdftotextで読んだ。文字化けしていたITmedia[57]はShift_JISでデコードして読んだ。WebSearchは2回使った（未来献立の献立構成、カシューナッツの経過措置）。

【主な訂正】
(1) me:newのハムの例は、レシピと買い物リストが逆。
(2) キッコーマンのレビューの「最近献立に入れたレシピがおすすめに出る」は、重複への不満であって、減塩についての好意的な声ではない。
(3) 5章「主食・主菜・副菜・汁物」の行で、4サービスが同じ単位としているのは不正確。クラシルとデリッシュは主菜・副菜・汁物、me:newは主食・主菜・副菜。未来献立の構成は出典で確認できない。
(4) 「苦手食材・アレルギー除外」の出典は[53]ではなく[18]。
(5) 「大さじ・小さじ」はレビューに出てこない。
(6) 「冷凍保存の検索17倍」は、手頃な野菜に限った平均で、クックパッドの自社データ。企画への示唆5にも同じ数字がある。
(7) 「共働き家庭は夕方の負担が大きい」には出典がない（[1]で補える）。

【スポンサー・自社発表なのに5章で注記がないもの】
- [3] パナソニックの調査ページは、冷凍冷蔵庫NR-F55HY3の販促を兼ねている。設問も冷凍室の機能に寄せており、82.2%は「何かしら困った」の合算値。
- [24] 冷凍宅配食「三ツ星ファーム」の自社PR。1章には注記があるが、5章と企画への示唆8にはない。
- [30] クックパッド自社の検索データ。
- [35] 業界団体（日本冷凍食品協会）の調査で、回答者は冷凍食品の利用者。
- [6] おいしい健康の自社リリース。
- [73] PR表記のあるアフィリエイト記事。

【母集団の偏り・比較の問題】
- [8] はイベント「リトル・ママフェスタ」の参加者318人。
- [38] は料理教室の受講生。7.9%の母数は「たんぱく質を意識している」847人で、全体比では約6%。
- [5] は首都・名古屋・阪神圏の20〜69歳。
- 5章の「罪悪感72.9%[24]に対し支持81.5%[5]」は、母集団も調査主体も違う2つの調査を並べたもので、直接は比べられない。

【引用の性質】
- [20] ハウスケアラボは企業ドメイン（assist-all.co.jp）のコンテンツ記事で、ユーザーの声ではない。
- [19] の「いや、それ買いに行かなないやん」は原文の誤字で、メモは「行かない」に直している。これらは著者が想定した「モヤっとポイント」として書かれたもの。「1ヶ月分…」はコメント欄での著者の返信。
- [73] の2件はAmebaブログからの引用で、それぞれme:newとDELISH KITCHENについての声。
- ITmediaの擁護コメントは短縮して引用されている。原文は「『Notion』や『Evernote』などメモアプリのWebクリップ機能と変わらないのでは」。
- App Storeのレビューは2020〜2025年の投稿。

【時点】
- アレルギーの症例データは2023年1月からの調査（報告書は2024年9月）。
- カシューナッツの表示義務は2026-04-01施行だが、経過措置が2028-03-31まである（名古屋市 https://www.city.nagoya.jp/kenkofukushi/eisei/1014927/1015056/1015091.html）。当面は旧表示の商品も流通しうる。

【担当外の付記】ITmedia[57]は文字化けではなくShift_JISで、デコードすると「未来献立。」と明記されている（2024年3月25日リリース、最大8日分、1万種超のレシピ）。ただし主菜・副菜・汁物の記載はないので、2章・3章の同じ記述にも出典の補強が必要。

</details>

## 02_global-needs.md（日本以外の生活者ニーズ）

照合 173件、確認済み 155件。

| 判定 | 箇所 | メモの記述 | 修正・補足 |
|---|---|---|---|
| 修正 | 0. 要点1 | 英国では夕食を決めるのに週43分かかる（2024年） | 週43分（年37時間）は夕食だけでなく、食事全般で「何を食べるか」を決める時間。夕食について言えるのは「夕食が最も難しい決定」と答えた人が57%だったことだけ。「英国では食事を決めるのに週43分かかり、57%が夕食が最も難しいと答えた（Dolmio委託・OnePoll 2,000人、2024-04-10）」と直す。米国の数値（夕食のみ、1日16分、2026年、Alaska Seafood委託）とは指標・年・スポンサーが違うので、並べて比べない。根拠：https://uk.news.yahoo.com/indecisive-brits-spend-37-hours-125045946.html |
| 出典で確認できず | 0. 要点4（見出し） | 家族内の制約の衝突が「最大の未解決課題」 | 出典[17]はGLP-1薬の使用率と費用負担の世論調査で、家族内の制約の衝突やその順位には触れていない。これを「最大」とする定量的な根拠はメモの出典に見当たらず、著者自身の総合判断にとどまる。 |
| 修正 | 1-1 同（英） | 「夕食を決める時間（英）」として週43分（年37時間）を記載 | 本文の43分と37時間は食事全般の数値（"deliberating what to have"、"make up their minds on what to eat"）。指標名を「食事を決める時間（英）」に直す。夕食に固有の数値は「夕食が最も難しい」57%だけ。根拠：https://uk.news.yahoo.com/indecisive-brits-spend-37-hours-125045946.html |
| 修正 | 1-3 米国 | 低所得層では、献立計画だけで「ロスが減った」と答える確率が+53% | 報告書本体（p.10）によると、+53.0%は「物価が理由で食費が減った」72世帯（世帯年収の中央値は約5.5万ドル）での値。所得で区切った低所得層の値ではなく、標本も72世帯と小さい。食費が増えた560世帯では献立計画は+9.9%で、最も強く結びついていたのは残り物の活用（+19.6%）。BioCycleは"particularly for lower-income households"と要約しているが、一次資料に合わせて「食費を減らさざるを得なかった72世帯では、献立計画を増やした世帯がロス減を報告する確率が53%高かった」と直す。根拠：https://refed.org/uploads/2026-refed-yougov-survey-report-final.pdf |
| 修正 | 1-4 主要サービスの規模 | 만개의레시피 月約917万訪問（サイト表記、2026/11閲覧） | サイトの表記は「월 방문자수 9,168,186」で、訪問数（visits）ではなく月間訪問者数（visitors）。「月間訪問者数 約917万（サイトの自社表記）」と直す。根拠：https://www.10000recipe.com/ のフッター（2026-11-08取得） |
| 修正 | §2 子育て中の親 | 離乳食が始まり「毎日3食」に絶望 | 原文は「生後10か月近い赤ちゃんが1日3食になり始めた」段階で、離乳食の開始ではない。“My baby is almost 10 months old and is now starting to have three meals a day.” “a slight meltdown about the prospect of having to make three meals, every single day”（r/Parentingの投稿をScary Mommyが紹介、2026-05-12）https://www.scarymommy.com/parenting/this-mom-asked-reddit-how-to-deal-with-the-monotony-of-making-meals |
| 修正 | §2 共働き | Albert Heijnは「台所に20分以上いたくない」日の献立を想定してAIを設計 | AHのSVP（Sjoerd Holleman）が、Steijnに投げられる質問の例として「グルテンフリーの友人が2人来る」「台所に20分以上いたくない」を挙げたもの。設計の前提とは書かれておらず、開発目的は「今夜の夕食は何？」に答えること。https://news.microsoft.com/source/emea/features/steijn-the-ai-assistant-transforming-meal-planning-for-millions-in-the-netherlands/ |
| 修正 | §2 学生・若い単身者 | ドイツの単身者で毎日料理するのは35%（同居世帯は48%） | 比較対象は「同居世帯」一般ではなく「パートナーと同居する人」（48%）。数値は正しい。BMLEH Ernährungsreport 2025 p.6（forsa、2025/5/22–6/11、約1,000人）https://www.tageskarte.io/fileadmin/Banner/ernaehrungsreport-2025.pdf |
| 修正 | §2 学生・若い単身者 | 少量パックの売上は+38.3% | コンビニGS25の「1〜2個入りまたは200g以下の小容量・小包装の生鮮食品」の売上が2026年1〜4月に前年同期比+38.3%。少量パック全般の数値ではない（同期間のCUの小包装商品は+26.2%）。https://www.segye.com/newsView/20260906501546 |
| 修正 | §2 アレルギー・持病 | 1型糖尿病の家族は、写真からの糖質推定を信用しない | 1型糖尿病の子をもつ親（Nk26）は「写真認識で糖質を数えようとしているのか、そもそも可能なのか」と質問しただけで、続くコメントでは大まかな推定（例：ピザ1切れは通常X g）を前向きに語っている。「医療判断に使えるほど信頼できない」と否定したのは別のコメント者（jrflowers、nihzmなど）。https://news.ycombinator.com/item?id=42168491 |
| 出典で確認できず | §2 料理初心者 | 「初心者向けに手順を書き換えるAI」が要望の多い機能に入っている | “AI Beginner Mode”（“Rewrite recipe directions to make your recipes more beginner-friendly!”）は新機能一覧に載っているが、要望が多い機能だとは個別に書かれていない。導入文は“highly requested features and smart improvements”と一括で、どれが要望によるものかは不明。ベンダー自身のブログ |
| 修正 | §3 英国 | 英国：夕食決めに週43分 | 週43分（年37時間）は「何を食べるか（食事全般）」を決めるのにかかる時間で、夕食に限った数値ではない。夕食については「最も難しい」と答えた人が57%という別の数値。Dolmio委託・OnePoll 2,000人、2024-04-10。https://uk.news.yahoo.com/indecisive-brits-spend-37-hours-125045946.html |
| 出典に到達できず | §3 東南アジア | 東南アジア：インドネシアで6割超が生成AIを健康・献立計画に使う（PwC VoC 2025） | PwC Indonesiaのプレスリリース（英・尼語）とファクトシートPDFはいずれも403で本文を読めなかった。検索結果の抜粋には“In Indonesia, over 60% of consumers are already using generative AI for personalised wellness and meal planning”（2025-07-08）とあり内容は一致しそうだが、ファクトシートでは60%が『comfort（抵抗がない）』の設問とされており、『使う』か『抵抗がない』かは本文で未確認 |
| 修正 | §3 中東 | 中東：ラマダン中は家庭ロスが最大50%増える（Veolia UAE） | Veolia UAEのCEO（Thierry Dezenclos）の発言で「一部の国では断食月に食品ロスが最大50%増えうる」。家庭ロスに限った数値ではなく、国も特定されていない。https://thenationalnews.com/climate/2025/03/05/ramadan-food-waste |
| 修正 | §4-3 3件目 | “if it takes more than 2 steps, I'm not eating”＝「2ステップ以上かかるなら、もう食べない」（r/ADHD、2025-12） | 原文・出典・時期は正しい（u/AdlerBalance179のコメント、2025-12-17頃）。和訳だけ修正が必要：“more than 2 steps”は「2ステップを超える（＝3ステップ以上）」で、「2ステップ以上」だと境界がずれる。§2の「2ステップを超えたら」に揃える。また原文は「そういう日もある」という文脈。根拠: https://reddit.sentinel-team.org/posts/1povnhe/snapshots/2025-12-17T15%3A11%3A57.257343Z |
| 修正 | §4-3 5件目 | “Endless options froze them at the recipe stage, so they picked nothing, or picked the easiest thing and felt bad about it.”（ADHD Weasel、2025-05。§4「生の声」に掲載） | 原文はURLに実在するが、ADHD当事者本人の発言ではない。ADHD向け献立アプリ（FeedMyADHD。2025年7月に終了）を作った事業者が「250人超のADHDの人に聞いた」内容をまとめた地の文（“The people we talked to named the same few walls. Endless options froze them…”）。生の声と分けて「事業者による聞き取りの要約」と明記すべき。時期も、表示日は2025-05-04だが本文に“We retired the app in July 2025.”とあり後日改稿されているため、「2025年（7月以降に改稿）」とするのが安全。根拠: https://www.adhdweasel.com/p/we-built-an-adhd-meal-planner-for |
| 修正 | §4-4 10件目 | “Does the photo recognition attempt to carb count what it sees? My son is a T1D and he still struggles with carb counting.”（HN、2024-11） | 原文は “Does the photo recognition attempt to carb count what it sees? Is that even possible? My son is a T1D and he still struggles with carb counting.”（Nk26、2024-11-18。時期・場所は正しい）。中間の “Is that even possible?”（そもそも可能なのか）が「…」なしで抜けている。この一文が懐疑の部分で、§2の「写真からの糖質推定を信用しない」の根拠にもなるので戻すべき（直後の返信jrflowersも写真からの糖質計算は信頼できないと述べている）。根拠: https://news.ycombinator.com/item?id=42168491 |
| 修正 | §4-5 3件目 | “Le partage de la charge des courses devient une simple discussion de groupe.”（2026-10。§4-5「小売AIの利用者・提供者の声」に掲載） | 原文は記事（2026-10-17、筆者Michaël Maarek）に実在するが、利用者やJowの発言ではなく記者の地の文。WhatsAppでJowziのグループを作り、家族が足りない物を書き込む機能を説明した一文。§4-5「利用者・提供者の声」からは外し、「メディアによる機能説明」として扱うべき。根拠: https://touteslesbox.fr/jowzi-ia-courses-jow/ |

<details><summary>検証者の所見（出典の質、スポンサー、時点のずれなど）</summary>

**G1**

【概要】§0「要点」と§1の表（1-1〜1-5）から61件を出典で確認した。supported 56件、corrected 4件、unsupported 1件、unreachable 0件。内訳は数値・日付・調査主体の主張が52件、生の声の引用が9件。

【直すべき点（ユーザー向けレポートに影響）】
(1) 英国の「週43分（年37時間）」は夕食ではなく食事全般で「何を食べるか」を決める時間。夕食について言えるのは「夕食が最も難しい」57%だけ。要点1、1-1、さらに担当外の「企画への示唆」1項目めも同じ誤りなので直す。米国の16分（夕食のみ・1日・2026年・Alaska Seafood委託）と英国の43分（食事全般・1週・2024年・Dolmio委託）は指標・年・スポンサーが違い、並べて比べられない。
(2) ReFEDの「+53%」は、報告書本体では物価が理由で食費が減った72世帯（世帯年収の中央値約5.5万ドル）での値。所得で区切った低所得層の値ではない。BioCycleの要約（"lower-income households"）が一次資料より強い言い方になっている。§2の「節約・低所得」も同じ限定が必要。食費が増えた560世帯では献立計画は+9.9%で、最も強く結びついていたのは残り物+19.6%、特売+14.9%、少量パック+11.3%。報告書は「単一の行動ではなく複数の行動の積み重ね」を強調している。一方、「献立計画と残り物がロス削減と最も一貫して結びつく」という表現自体は報告書の提言にある。
(3) 만개의레시피の917万は月間「訪問者数」で、訪問数ではない。
(4) 要点4の「最大の未解決課題」は出典のない著者の総合判断。

【スポンサー・自社発表の明示漏れ】
- 要点では、表で付けていた※や委託の記載が消えている：要点1（Talker Research＝Alaska Seafood委託、Dolmio委託のOnePoll、Receiteria）、要点2（Instacart）、要点5（HelloFresh、Attest）。
- メモのどこにも自社調査・業界調査と書かれていないもの：
  - US Foods：外食卸の自社調査で、12分は外食先を選ぶ文脈。
  - Receiteria：レシピサイトが自社の読者を調べたもの（非代表とは書いてある）。
  - NFRA：冷凍・冷蔵食品の業界団体で、個包装・冷凍食品に利害がある。全体2,003人のうちGLP-1使用者は241人。
  - [40]：MicrosoftのAI顧客事例記事。AHの500万人と利用者の声はベンダーのPRに由来する。
  - Chefkoch・Jow・만개의레시피の規模：いずれも自社表記。
  - PwC：コンサル会社の自社調査を二次記事（Consultancy.lat）で確認した。

【数値の注記】
- Chefkoch：BCNのページは「Unique Users 20.00 m」（2025/10）で、期間の明記がない。Ad Allianceの媒体資料（Macwelt 2025-02-22）は月2,200万UUとしており、出典によって数値が違う。
- WRAPの捨てた理由は重量比で、人数の割合ではない。£1,000はTable 7では£1,030。
- HelloFreshの64%は「料理する人」が母数。58%は「自炊が減ると見込む理由」の割合。
- Attestはn・調査時期を出さないまま2026-11-04に更新されている。FMIもn・時期の記載がない。

【取得の状況】
- UNEPのプレスリリースは403だったため、同じ内容のUN Newsで確認した。
- HN 45724229の投稿時刻は公式APIで2025-10-27（UTC）。ページの表示は10/30だが、メモの日付と矛盾しない。
- Redditのスナップショットにある「Posted N days ago」は今日（2026-11-08）が基準で、各スナップショットの日付と一致する。メモに書かれた投稿時期と矛盾はない。

**G2**

対象：§2・§3の表の主張80件（短い引用・生の声の約20件を含む）を出典本文で確認。結果は supported 71、corrected 7、unsupported 1、unreachable 1。

【要修正（重要な順）】
1) 英国「夕食決めに週43分」[2]：原文の週43分（年37時間）は食事全般を決める時間で、夕食に限らない。同じ誤りが §0要点1・§1-1「同（英）」・企画への示唆にもある（担当範囲外だが出典が同じなので修正を推奨）。
2) 中東「ラマダン中は家庭ロスが最大50%増」[33]：実際はVeolia UAE CEOの発言で「一部の国で食品ロス全般が最大50%」。家庭ロスではない。§2の同じ趣旨の記述にも「一部の国で」を補うとよい。
3) 韓国「少量パックの売上+38.3%」[25]：コンビニGS25の小容量の生鮮食品に限った数値（2026年1〜4月、前年比）。
4) Albert Heijn「台所に20分以上いたくない日を想定して設計」[40]：SVPが挙げた質問例の1つにすぎない。
5) 「1型糖尿病の家族は写真の糖質推定を信用しない」[57]：当の親は質問しただけで、続くコメントでは推定に前向き。否定したのは別のコメント者。
6) ドイツ「同居世帯48%」[10]：比較対象はパートナーと同居する人。
7) 「離乳食が始まり」[44]：原文は生後10か月近い子が1日3食になり始めた段階。
8) Plan to Eat「初心者向けAIが要望の多い機能」[61]：その機能が要望によるものかは書かれていない（unsupported）。

【スポンサー・自社発表で表に明示がないもの】§1では※が付いているHelloFresh[5]（マンネリ58%）、Instacart[6]（30–44歳データ）、Chicory[20]（+450%、レシピ広告企業）、Plan to Eat[61]が、§2では無印になっている。メモでまったく触れていないものは次のとおり。
- NFRA×Morning Consult[18]：NFRAは冷凍・冷蔵食品の業界団体
- Microsoft Source[40]：Microsoftの自社広報記事で、利用者の声も同社が選んだもの
- Neogrid×Opinion Box[36]：Neogridは小売・サプライチェーン向けのデータ企業
- Opensurvey[23]：調査会社の自社コンテンツ
- Veolia[33]：廃棄物処理企業のCEOの発言
- Chefkoch[37]・Jow[38]：自社申告の値
- ADHD Weasel[60]とShow HN[54][59]：開発者による自作サービスの紹介

【時点のずれ】
- Mumsnet[43]は2022年のスレッド（§2節約、§3英国のTesco/Aldi）。原則の2024〜26年から外れ、表には年が書かれていない。
- FARE[22]は2018〜19年の研究に基づき、ページに日付がない。
- 韓国の単身世帯804万は2024年基準（国家데이터처、2025-12-09公表。newsis https://www.newsis.com/view/NISX20251209_0003433761 で確認）。HMR市場6.8兆ウォンは2025年の値（韓国農村経済研究院）。
- Central do Varejo[36]は掲載日なし。台湾[30]は調査年不明（メモの記載どおり）。
- Redditの投稿時期は、sentinelの「N days ago」から逆算するとスナップショット日とほぼ一致した。HN[54]の投稿時刻はAPIで2025-10-27、[59]は2026-08-16で、どちらもメモと一致。

【その他】
- PwC VoCの数値は、プレスリリースでは「使う」、ファクトシートでは「抵抗がない（comfort）」と表現が揺れている（タイ47%、インドネシア6割超、ブラジル5割超）。§3中南米の「5割超」はブラジルだけの数値。
- インドネシアはpwc.comが403で本文を読めなかった。タイはthaipr.netに転載されたリリースで確認した。
- [28]の2つ目のアプリ（냉쿡 id6745560834）はKR・USのストアとも404。
- [29]时食记は評価件数も表示されない小規模アプリで、中国の代表例としては弱い。
- Chefkochの2,000万UUは、BCNのページに「月」の明記がない。月間であることは2022年のtageskarte記事（https://www.tageskarte.io/gastronomie/detail/chefkoch-bekommt-tv-format-bei-rtl.html）で補った。
- GLP-1の記事[18]は「単に食べる量が減っただけではない」と書いており、摂取量そのものは測っていない。
- オマーンの約30%[34]は自己申告の集計で、統計的に統制した効果ではないと論文自身が書いている。UAEの61%の出所は、Ne'maの2022年の世帯調査（6,083人）。
- BMLEH[10]とWRAP[12]のPDFはWebFetchで読めなかったため、取得したファイルをpdftotextで抽出して確認した。
- §3のKptnCook・Instacart・HelloFreshはサービス名だけで、規模の出典はない。

**G3**

【総括】§4の引用30件（「/」でつないだものを含む）は、すべて出典URLに原文が実在した。表記した時期・媒体名もすべて一致した。修正が必要なのは4件。①[57]の糖尿病のコメントが、中間の一文 “Is that even possible?” を「…」なしで抜いている。②[49]の和訳「2ステップ以上」は「2ステップを超える」が正確。③[60]は当事者の発言ではなく、事業者が聞き取りをまとめた地の文で、表示日（2025-05-04）より後に改稿されている。④[39]は記者の地の文で、§4-5の「利用者・提供者の声」に当たらない。

【確認方法】HN 3件は、生HTMLで文字列が一致することを確認し、投稿日をHN APIで確認した（[54] 2025-10-27、[55] 2025-04-03、[57] 2024-11-18）。Mumsnet、Redditのスナップショット、Microsoft、Jow、Toutes les Box、ADHD WeaselはWebFetchの抽出結果で判断した。curlでの一括取得は、自動モードの分類器が拒否したため行っていない。

【Reddit】reddit.comはWebFetchでも取得できなかった（メモの記述どおり）。9件ともreddit.sentinel-team.org（非公式の第三者ミラー）だけで確認している。各スナップショットの “View linked content” は原URLと一致する。“Posted N days ago” を今日（2026-11-08）から逆算すると、投稿日はスナップショット日とほぼ同じ（[48]だけ約4日前の2026-02-23頃）。投稿IDの並び順とも矛盾しない。最終レポートでは「第三者アーカイブで確認」と注記するのが望ましい。

【発言者】多くはスレ主ではなく、返信・コメントの発言である。[41]のMama2many73とFusionChefGeoff、[42]のteaandtoastwouldbenice、[45]のチラシ（u/RImom123）、[46]のu/VeterinarianLegal920とu/Itstimeforcookies19、[47]のu/nuer0_、[48]のu/timmasterson、[49]のu/AdlerBalance179、[51]のu/mortennordbye。「/」で並べた[54]（mips_avatar / r0fl）と[40]（van Straaten / Willems）は別人なので、同じ人の発言に見えない書き方にする。

【スポンサー・自社発表のうち、メモに注記がないもの】
- [40]はMicrosoftの自社広報記事（SteijnはAzure OpenAIで構築）。利用者の声は広報のために選ばれたものなので、§0の「割り引いて読む」対象（※）に含めるべき。
- [60]は自社アプリ（FeedMyADHD）を作った事業者のブログ。現行の見出しは「A Meal Plan Made for ADHD Brains」で、出典一覧の「We built an ADHD meal planner…」（URLの文字列由来）とは違う。[61]のような「ベンダー」注記もない。
- [53]は自作アプリ（inthecupboard.app）の宣伝投稿。
- [54][55][57]はShow HNで、特定の製品へのフィードバックであり、一般的なアプリへの不満ではない。ベーコンの件、生成に5分の件、月10ドルの件はいずれも “Meals You Love” についての指摘。
- [50]の投稿者も自分用のアプリを作ったと書いている（名称・リンクなし）。
- [38]はJowの自社説明文（メモに明記あり）。

【担当外だが、同じ出典で確認できたこと】
- §2の「仕事で一日中判断した後に形にするのが重い」[45]はu/plowmanii5、「定番15品ほど」[45]はu/No-Long5784のコメントに実在する。
- §2の「空腹に気づけず、払えないテイクアウトに頼る」[48]はスレ主の本文、「冷蔵庫に貼れる週メニュー」[46]はu/milk_boneのコメントにある。
- §2の「見えない食べ物は存在しなくなる」[60]も事業者の地の文（“Food they could not see stopped existing”）で、当事者の引用ではない。
- §2の「Albert Heijnは『台所に20分以上いたくない』日の献立を想定してAIを設計」[40]は、AH幹部Sjoerd Hollemanが利用者の要望の例として挙げた仮定の話で、「設計」とまでは書かれていない。
- 次は出典と一致した：Jow「1,000万人超」（“Déjà plus de 10 millions d'utilisateurs”）、AHアプリ500万人、2万超のレシピ、冷蔵庫の写真からの提案、Jowzi「週60ユーロ以下の献立例」（Jow側の例として掲載）。

</details>

## 03_ai-apps-and-trends.md（世界のAI献立アプリとトレンド・市場）

照合 230件、確認済み 199件。

| 判定 | 箇所 | メモの記述 | 修正・補足 |
|---|---|---|---|
| 修正 | 1-1 ReciMe行・アプリ列 | ReciMeは豪州発、2024年に本拠をNYへ移した | 出典（SmartCompany、2024-07-02）は「Melbourne-born」「The founders moved to New York in April」「New York-based founders」と書くのみで、会社の本社移転とは書いていない（App Storeの販売元は豪法人ReciMe Pty Ltd）。「豪メルボルン発。2024年4月に創業者がNYへ移った」が正確。根拠: https://www.smartcompany.com.au/startupsmart/news/aussie-cooking-app-startup-recime-raises-1-5-million-seed/ |
| 修正 | 1-1 ReciMe行・価格列（3-2にも転記） | ReciMe Plus 29.99〜59.99ドル（期間の表記なし） | App Storeのアプリ内課金は10項目すべて「ReciMe Plus」で、価格は6.99〜59.99ドル（6.99／29.99／39.99／59.99）。期間の表記はない。6.99ドルの項目が抜けている。根拠: https://apps.apple.com/us/app/id1593779280 |
| 出典で確認できず | 1-1 Paprika行・状況列（3-3にも転記） | Paprikaは買い切り型からサブスクへ移行 | 公式は「Paprika 4 replaces Paprika 3」「Paprika 3 owners get a discount on it」とし、Premiumを「subscription」と書くのみ。Paprika 3が買い切りだったとは書いていない。App Store（id1303222868）は現在「Paprika Recipe Manager 4」無料＋「Paprika 4 Premium $14.99」（割引$9.99）で、「Existing users retain all features from Paprika 3」とある。移行を示唆するが「買い切り」の明記は一次情報で見つからなかった |
| 修正 | 1-1 SideChef行・価格列（3-3にも転記） | SideChefの収益はB2B（注文単位の広告など） | ［29］の2つのURL（BusinessWire本文は403、SideChef掲載の同文と小売向けページ）には注文単位の課金は書かれていない（発表文は「new ad revenue streams」「in-recipe shoppable campaigns」まで）。注文単位の広告はSideChefのCPOページ「With CPO Campaigns, you only pay for orders directed to our trusted retailers」で確認できるため、出典を差し替える: https://business.sidechef.com/cost-per-order |
| 出典で確認できず | 1-1 Tasty Botatouille行・価格列 | Botatouilleは無料 | 発表文に価格・無料の記載なし。「for the brand's most loyal users」向けに開始し、「currently exclusive to the iOS version of the Tasty app」とあるのみ（［30］BusinessWire版は403） |
| 出典で確認できず | 1-1 Jow行・価格列 | Jowは無料（小売との連携で収益） | tech.euの記事に料金・収益モデルの記載なし（「software-only approach」とあるのみ）。jow.comにも無料かどうか・収益源の記載はない（「Available with」にKroger系バナーを列挙） |
| 修正 | 1-2 Cal AI行・価格列 | Cal AIのアプリ内課金 2.99〜29.99ドル | App Storeのアプリ内課金は0.99〜29.99ドル（「Unlimited」が2.99〜29.99ドル、ほかに「Streak Restore $0.99」）。サブスクの価格帯として書くなら2.99〜29.99ドルで可。根拠: https://apps.apple.com/us/app/id6480417616 |
| 出典で確認できず | 1-2 Fitia行・状況列 | Fitiaは2024年から米国へ展開 | ［41］のyespressは403、Aboutページに記載なし。Infomercado（2024-08-12）は「En 2024 planean su expansión a los Estados Unidos, Australia, Canadá e Inglaterra」と計画として書く。descubre.vc（2026-06）は「ha iniciado su expansión al mercado de EE. UU.」と2026年に開始を報道。2024年に展開を始めたことは確認できない |
| 修正 | 1-2 Noom行・価格列（3-2にも転記） | Noom Microdose GLP-1Rx 初回119ドル、以後月199ドル（薬代込み、2025-08） | 出典（Athletech、2025-08-08）は「starts at $119, with a monthly cost of $199」「includes GLP-1 medication (if prescribed)」で、「初回」とは書いておらず、薬は処方された場合のみ。Noom公式の発表ページ（2025-08-04付、2025-11-26更新）は「priced at $99 to start, followed by $199 per month」と書いている。「開始時119ドル（2025-08の報道）、公式ページでは現在99ドル。以後月199ドル（処方された場合は薬を含む）」とするのが正確。根拠: https://www.noom.com/in-the-news/noom-launches-microdose-glp-1-program-enabling-weight-loss-without-the-side-effects-and-priced-at-119-to-start-including-medication-and-microhabits-program/ |
| 修正 | 1-3 Instacart行 | InstacartのChatGPTアプリは「初のInstant Checkout」 | 「初のInstant Checkout」ではなく「ChatGPT内でInstant Checkoutを提供した初のアプリ（Instacartの自社発表）」とすべき。Instant Checkout自体は2025-09-29にEtsyで始まっている（[53]）。自社リリースの文言は「the first grocery partner to launch an app on ChatGPT and the first to offer an embedded, end-to-end shopping and Instant Checkout」。根拠: https://company.instacart.com/pressreleases/instacart-app-launches-in-openai-chatgpt |
| 修正 | 1-3 Tesco行／2章「食品ロス削減」 | Tescoは残り物の活用による食品ロス削減を狙う | 「残り物の活用」ではなく「家にある食材を使った献立の提案で食品ロスを減らす」。根拠: https://www.grocerygazette.co.uk/2026/04/09/tesco-trials-ai-shopping-assistant-with-280000-colleagues-ahead-of-customer-rollout/ |
| 修正 | 1-3 HelloFresh行 | 2025-11 AIでレシピカード制作を数か月から数時間に短縮 | 「数か月から数時間」→「数週間〜数か月から数時間」。配信日は2025-11-19（出典一覧の2025-11-06は転載各紙の日付と合わない）。根拠: https://retailtimes.co.uk/hellofresh-harnesses-ai-to-accelerate-delivery-of-chef-created-recipes ／ https://www.grocerygazette.co.uk/2025/11/19/hellofresh-to-develop-ai-powered-recipe-cards/ |
| 出典で確認できず | 1-5 GE行 | Flavorly AIはKroger・Instacartとつながる | [69]にKroger・Instacartの記載はない。別資料では、Kroger連携は2023-12のオーブン画面での買い物機能でFlavorlyとは別（Shelby Report 2023-12-14）、Instacart連携は2024年秋からSmartHQ経由でFlavorlyのレシピの不足食材も注文可（GE Appliancesの発表 https://geappliancesco.com/ge-appliances-among-the-first-invited-to-join-instacarts-new-developer-program/）。 |
| 出典で確認できず | 1-5 Skylight行／3-2 | Skylight Plusは年79ドル | [32]に価格の記載はない（Plus会員限定とあるのみ）。公式ページ https://myskylight.com/products/calendar-skylight-plus には「Get Plus for $79/year」とあり、出典を差し替えれば裏付けられる。 |
| 出典で確認できず | 1-5 Skylight行 | Skylight：レビューでは精度に課題が指摘されている（レビュー記事ベース） | [32]は精度の問題に触れていない（ベータであることと、筆者の試行で2品が提案されたことのみ）。The Vergeのレビューは取得できず、別の裏付けも得られなかった。 |
| 修正 | ## 0. 要点 1点目 | 2025〜26年に小売（Instacart、Walmart、Kroger、Albertsons、Tesco、Woolworths、Shipt）と汎用AI（ChatGPT、Gemini/AI Mode、Claude、Alexa+、Meta Muse）の両方で「献立→カート」が標準機能になった | Tescoは2026-04-09時点で社員約28万人向けの“beta trial for colleagues”にとどまり、顧客向けは“later this year”の予定（顧客展開は今回確認できず。メモ1-3でも未確認扱い）。要点では「Tescoは社員向けに試験中」と分けて書くべき。他はそれぞれ一次情報で確認できた：Instacart（DC360 2026-09-09／Instacart 2026-05-19・07-16）、Walmart（Retail Dive 2026-11-05）、Kroger（Kroger 2026-07-28）、Albertsons（IBR 2025-12-03）、Woolworths（Inside Retail 2026-01-13）、Shipt（Shipt 2025-10-02・2026-08-18・09-09）、Alexa+（Grocery Dive 2025-03-05）。なおMeta Museは「保存したレシピ動画→買い物リスト」までで、カートは作らない（https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/）。 |
| 出典で確認できず | ## 2. トレンド（エージェント型） | Woolworthsは（AI内での決済に）慎重姿勢 | 記事にWoolworthsの慎重姿勢を示す記述はない。むしろGoogleの機能として“add items to a customer's cart and handle checkout – with consent”と、同意があれば決済まで扱えると書かれている（2026-01-13）。 |
| 修正 | ## 2. トレンド（栄養パーソナライズ） | Menu-Order AIは4.5か月で11万DL（自社発表） | 原文は「発売から5か月未満で11万DL超」（“surpassed 110,000 downloads less than five months after its launch”）。「4.5か月」の記載はなく、発売日も書かれていない。表記は「Menu-Order-AI」、2026-04-24付プレスリリースの転載。https://briefglance.com/articles/ai-dining-app-for-glp-1-users-crosses-110000-downloads-in-months |
| 出典で確認できず | ## 2. トレンド（食品ロス） | 家庭だけで1日10億食分を廃棄 | UN Newsは“an equivalent of one billion meals go to waste every day”と全体の数字として書き、家庭に限定していない。併記のIISDとUNEPプレスリリースは403で、Web検索も上限のため、家庭に限定する一次情報は確認できなかった。 |
| 修正 | ## 2. トレンド（物価高への対応） | 予算と特売に連動（Kroger、Woolworths、Instacart、Walmart） | Kroger（“build a cart around budget and dietary needs”、https://www.thekrogerco.com/ir-feed-item/kroger-helps-families-simplify-back-to-routine-season-with-fresh-convenient-meals-and-a-smarter-way-to-shop/）、Woolworths（“spotting the specials that matter to your budget”、Inside Retail）、Instacart（“stay on budget”、Digital Commerce 360）は確認できた。WalmartのRetail Dive記事[50]には予算・特売との連動の記述がない。Walmartは外すか、別の出典が必要。 |
| 修正 | ## 2. トレンド（物価高への対応） | 【引用】HelloFreshは「米国人の85%が経済的な理由で自炊している」と引用 | 85%はPrepared Foods記事の地の文で、出典名のない“consumer behavior research”として紹介されたもの（“85% of Americans are cooking at home due to economic factors”）。記事にHelloFreshの発言や引用はなく、HelloFreshが引用したとは確認できない。「業界誌が出典不明の調査として紹介」と書くべき。https://www.preparedfoods.com/articles/130789-hellofresh-invests-70m-in-product-innovation-to-expand-menu-boost-personalization |
| 修正 | ## 2. トレンド（供給側：AI検索とレシピ制作者） | フードブロガー22人への取材で、流入が30〜80%減 | 「22人（“22 independent food creators”）への取材」は正しいが、30〜80%は個別事例を並べた数字（Google流入-30%・Pinterest-50%、特定レシピ-40%、CTR-30%、2年で流入と収益の80%が消失）で、22人全体の減少幅ではない。「取材先の事例では30〜80%減」と書くべき。https://fortune.com/2025/11/26/ai-slop-recipes-thanksgiving-food-blog-collapse-traffic |
| 出典に到達できず | 3-1表 | Deep Insights Research：献立アプリ2025年4.14億ドル→2032年9.59億ドル、12.7% | marketresearch.comは403。Web検索がセッション上限に達しており、代替の一次情報を探せなかった（メモ自身も検索結果の要約と明記）。 |
| 修正 | 3-2 価格帯 | ReciMe（Plus）29.99〜59.99ドル | App StoreのReciMe Plusのアプリ内課金は$6.99〜$59.99（$6.99、$29.99、$39.99、$59.99。期間の表記なし）。「29.99〜59.99ドル」は$6.99の項目を落としている。https://apps.apple.com/us/app/id1593779280 |
| 出典に到達できず | 3-2 価格帯 | Mealime Pro（終了前は月2.99ドル） | App Storeのページは404（削除済み）。閉鎖告知とトップページにPro価格の記載はない。Web検索は上限のため代替情報で確認できなかった。 |
| 修正 | 3-2 価格帯 | Skylight Plus 年79ドル | 引用元のDigital Trends（2024-12-05）には価格の記載がない。公式のCalendar Plusページに“Get Plus for $79/year”とあり（https://myskylight.com/products/calendar-skylight-plus）、金額は合っているが出典を差し替え、名称を「Calendar Plus」と明記すべき（公式のPlusページ https://myskylight.com/plus/ ではFrame Plusが年39ドル）。 |
| 出典で確認できず | 3-3 リテールメディア | SideChefは注文単位の広告 | Business Wireは403。併記のfor Retailersページは広告メニュー名だけで課金方式の記載なし。B2Bトップ（https://business.sidechef.com/）に“campaigns with guaranteed orders”とあるが、注文単位の課金とは書かれていない。検索上限のため追加確認できず。 |
| 出典で確認できず | 3-4 資金調達とM&A | Jowは2021年に2,000万ドルを調達 | 記事は以前のSeries Aで投資家が“pump $20 million into the startup”と書くだけで、2021年という年は書かれていない。検索上限のため年を確認できなかった。 |
| 出典で確認できず | ## 4. 人気指標 表1行目の注記 | 上記はアプリ内課金ベース・全OS合算の順位 | 記事は“on the unified platform”とあるだけで、unifiedの定義（iOS＋Google Playか）も、順位の基準（アプリ内課金売上か）も書いていない。順位番号も付いていない。 |
| 修正 | ## 4. 人気指標 表5行目 | ReciMeはFood & Drink無料11位（評価33万件、2026-11-08閲覧） | 同日（2026-11-08）の検証時の表示は“#7 in Food & Drink”。評価4.8・33万件は一致。順位は日中でも変わるため、レポートでは閲覧時刻を添えるか「Food & Drinkで10位前後」と幅を持たせる。https://apps.apple.com/us/app/id1593779280 |
| 修正 | ## 4. 人気指標 読み取り | ReciMeは課金上位なのに、公表されている調達額は小さい（2024年時点でA$150万） | 2024-07の$150万のシードに加え、2023年に$50万のプレシード（Alice Anderson Fund、Even Capitalなど）が報じられている（https://www.smartcompany.com.au/startupsmart/news/recime-sizzles-jumping-20000-400000-users-in-2023/）。公表額は合計約$200万。通貨はどちらも「$」表記でAUDとは明記されていない。「少額」という結論は変わらない。 |

<details><summary>検証者の所見（出典の質、スポンサー、時点のずれなど）</summary>

**A1**

【集計】1-1・1-2の表から71件を確認した。supported 62、corrected 5（ReciMeのNY移転の表現、ReciMe Plusの価格帯、SideChefの注文単位課金の出典、Cal AIの課金の範囲、Noomの価格）、unsupported 4（Paprikaの「買い切り→サブスク」、Botatouilleの「無料」、Jowの「無料・小売連携で収益」、Fitiaの「2024年から米国展開」）、unreachable 0。
【生の声】担当範囲にユーザーの生の声の引用はない。代わりに、自社主張や発言の原文がURLに実在することを8件以上確認した。「growing community of 15 million users」（ReciMe）、「trusted by over 10 million users worldwide」（Fitia）、「Samsung Food has garnered over six million users」、「the only recipe app that analyzes the video itself」（Deglaze）、「apply a full week plan up to 2 times for free」、「The Cal AI app will remain independent」、MFPのCEOの「We both do meal scan」、「Since 2017, Jow has amassed…over 6 million across France」、「Paprika 4 replaces Paprika 3」。
【自社発表・提供元が書かれていないもの】(1) Samsung Foodの600万ユーザーは、Samsung自社ニュースルームの発表。(2) Cal AIの1,500万DL・年商3,000万ドルは、買収側のMFPがTechCrunchに伝えた数字で、独立した検証はない（要点・示唆6・4章でも使われている）。(3) Sensor Towerの売上・DL・アクティブは推計値だが、メモには推計と書かれていない。記事は「unified」の定義も収益の種類も示していないため、4章の「アプリ内課金ベース、全OS合算」は出典に明記がない。(4) Crouton・ChefGPTの価格が競合ページ由来であること、Deglazeの記述が自社主張であることは、メモに表示済み。
【取得できなかった出典と代替】次の出典は取得できず、代替で確認した。出典一覧のURLは差し替えを推奨する。
- ［95］SamMobile（403）→ 9to5Google
- ［29］BusinessWire（403）→ SideChef掲載の同文
- ［30］BusinessWire（403）→ BuzzFeed掲載の同文
- ［41］yespress（403）→ vcbacked、descubre.vc
- ［20］Mealie docs（301で転送後に404）→ 現行のmealie.io/documentation/getting-started/installation/ai-providers/
【時点のずれ】
- Noomの公式発表ページ（2025-11-26更新）は開始価格を99ドルとしている。
- Jowの現行サイトは「Join 7 million people」（フランス限定ではない）。
- Paprika 3のApp Store（id1303222868）はPaprika 4に置き換わり、Premiumは14.99ドル（割引9.99ドル）。
- Samsung Foodの600万ユーザーは2024-07時点で、2年以上前の数字。
- Dexcomの2026-02-04発表は「in the coming weeks」に全米展開としている。
- Fitiaの米国展開は2026-06の報道。
【メモの「未確認」を埋められる点】SamsungのWhisk買収は2019年（9to5Google）。Cal AIの開始は2024年5月（YPulse）。Paprika PremiumはApp Storeで14.99ドル。
【表現の注意】
- ReciMeの「A$150万」は、本文では「$1.5 million」と通貨記号だけ。豪メディアの記事なので豪ドルと読むのが自然だが、明記はない。
- PestleのTikTok取り込みは、動画の説明文（caption）を処理する方式（TechCrunch）で、Deglazeの映像解析とは別物。2章や示唆3の「音声やテロップの解析」と並べる際は区別が必要。
- Croutonの年14.99ドルはDiscover層の価格で、別に24.99ドル買い切りのPlusがある。
- NoomのGLP-1 Companionは行動変容プログラムとして書かれており、AI機能とはされていない。
- JowのSeries A計3,300万ドルは、2,000万＋1,300万ドルからの計算値。
- 示唆3で「課金が実証済み」とされるPestleとHoneydewは、売上の出典がなく、確認できたのはApp Storeの評価件数（各1.9千件）だけ。
【範囲外の参考】4章の「ReciMe 2023年に2万→40万ユーザー」は、SmartCompany（2023-12-18）の「from 20,000 to over 400,000 in the space of 12 months」で確認した。同じ記事に2023年のプレシード50万ドルがあり、4章の「公表されている調達額はA$150万」はこれを含んでいない。

**A2**

【範囲と結果】1-3〜1-6の主張67件（引用・発言10件を含む）を確認した。supported 61、corrected 3、unsupported 3、unreachable 0。数値と日付は大半が出典どおりだった。

【修正が必要な3件】(1) Instacartの「初のInstant Checkout」：[44]には記載がない。Instacart自身の発表では「Instant Checkoutに対応した初のアプリ」で、Instant Checkout自体は2025-09にEtsyで始まっている。(2) Tescoの「残り物の活用」：原文は「家にある食材」。(3) HelloFreshの「数か月→数時間」：原文は「数週間〜数か月→数時間」。配信日も2025-11-19。

【出典に書かれていない3件】(1) GEの「Kroger・Instacartとつながる」：[69]に記載がない。Kroger連携は2023-12のオーブン機能で、Flavorlyとは別。Instacart連携は2024年秋から。(2)(3) Skylightの価格と「精度に課題」：[32]にない。価格は公式ページで年79ドルを確認できたので、出典を差し替えれば使える。精度の指摘は裏付けがなく、削除か別の出典が必要。

【取得できなかった出典と代替】[47] Technobezz（403）はPYMNTS 2026-04-24で代替。[65] Business Wire（403）は同じリリースの転載で代替。[72] Chain Store Age（403）はAmazon公式とDigital Commerce 360で代替。[4] Samsung英国版（404）は同じPRのAAP転載（2025-12-22）で代替。[23] Business Wire（403）は[22]で代替。出典一覧のURLと日付を差し替えることを勧める（[4]は2025-12-22、[65]は2025-11-19、Alexa.comの開始は2026-01-05）。

【「未確認」を外せるもの】Tescoの顧客向け展開（[60]、Independentの転載、CEOの発言つき）、Museの価格（[34]）、Alexa.comの週間献立→カート（Amazon公式）。PlateJoyの終了は逆に一次情報が見つからない。メモの注記は維持すべき。

【自社発表・スポンサーの明記漏れ】メモで「自社主張」と書かれているのはAlbertsonsの46分→4分だけ。次のものも自社発表または関係者の数字なので、レポートでは明記すべき。
- Instacartの「初」と、Clementineの品数・115ドル超（115ドルは同社全体の平均バスケットで、2026-06-30時点）
- Walmart Sparkyの+40%・+70%（CEOと自社の発表。+40%は利用者の自己選択による相関で、因果は示されていない）
- Alexa+の「数千万人」「レシピ5倍」（Amazon）
- Shopify約30店（Forresterアナリストの推計）
- Cal AIの数値（買収側のMFPが提供）

NBER論文について、メモは「二次情報」としているが一次資料である。ただし著者7人中6人がOpenAI所属で、社内データを使った査読前のワーキングペーパー。「OpenAI関係者による分析」と注記すべき。また0.9%はFigure 9（2024-05〜2025-06の平均）の値で、24%（2025年7月）とは時点が違う。InstacartのPRには同社が委託したHarris Poll（2026年6月、2,059人）が含まれている。使うならスポンサーを明記する。

【時点・表記の注意】Ollieの本体はSMS型で、公式も「no app is needed」としている。削除を確認できたApp Storeアプリは同じ運営会社の献立アプリ。Tescoの28万人は早期アクセスの予定人数。Shiptの小売数は100超と120超が混在している。Instacartの小売数は、ChatGPT内で使える数が1,800超（2025-12）、2026年は2,200超（banners）。WoolworthsのOliveをGemini Enterpriseと結びつけているのは記事の文脈からの読み取りで、明文はない。

【担当範囲外で気づいた点（要確認）】
- 2章の「Woolworthsは慎重姿勢［61］」：[61]に根拠がない。Google側の説明はむしろ「handle checkout – with consent」。
- 2章の「HelloFreshは『米国人の85%…』と引用［64］」：[64]では編集部が出典不明の「consumer behavior research」として書いており、HelloFreshの発言ではない。原文はeconomic factors。
- 3-3の「OpenAIはInstacartの売上から少額の手数料［44］」：[44]ではagentic commerce全般の「small fee」で、Instacart固有ではない。Instacartのリリースにも手数料の記載はない。

**A3**

担当範囲（0・2・3・4節と、示唆の根拠になっている数値）の主張92件を確認した。内訳は supported 76、corrected 9、unsupported 5、unreachable 2。引用・発言の確認は11件（Walmart「3分の1」・CEOの40%、Sprout 50%、Morning Consult 45%、Chicory 71%、HelloFresh 85%、Ollie CEO、Frankenstein、Meta Muse、Instacartの例示プロンプト、Amazon VP）。

【検索の上限】確認の途中でWebSearchがセッション共有の上限（200回）に達した。このため403/404だった出典は代替の一次情報を探せていない（Deep Insights＝marketresearch.com、Mealime App Store、IISDとUNEPのプレスリリース、SideChefのBusiness Wire、Technobezz）。Jowの「2021年」、UNEPの「家庭で1日10億食」、Mealime Proの価格は未確定のまま。追加で調べるには、次のメッセージで続きを指示する必要がある。

【スポンサー付き・自社発表なのにメモで明示されていないもの】①Sprout Socialの50%は、SNS運用ツール企業のSprout Socialが委託し、Glimpseが実施した調査。「SNSが最も頼られる」という結論に利害がある。②Cal AIの1,500万DL・年商3,000万ドルは、買収したMyFitnessPal側の数字。③Alexa+の「数千万人」「レシピ利用5倍」はAmazon幹部の発言で、比較の基準がない。④Walmartの+40%はCEO発言（2節では明記なし）、Clementineの115ドル超はInstacart自身の発表。⑤ChatGPTの利用論文はOpenAIの社内データを使った未査読のNBERワーキングペーパーで、共著者の利害開示がある。なお0.9%は論文のFigure 9に明記されており、メモの言う「二次情報」ではない。⑥HelloFreshの85%は、業界誌が出典名のない調査として地の文で紹介したもので、HelloFreshの引用ではない。Chicory、Menu-Order-AI、Albertsons（46→4分）、ReciMeの1,500万人は、メモで適切に注記されている。

【出典の質】市場規模のレポートは有料で方法が不明なうえ、同じページの中でも数値が食い違う。Intel Market Researchは見出しが2025年3.8億→2034年12.5億ドルなのに、競合の節では2023年3.01億→2030年7.26億ドル。Market.usは22.68億ドルとFAQの23.675億ドル。Sacraは本文の37.42億ドルとサマリーカードの36.3億ドル。一方、DataHorizzonとMarket.usはメモでは「未確認」だが、現在はページで確認できる。Sensor Towerのブログは、「unified」の定義も順位付けの方法も順位番号も書いていない。さらにReciMeのアクティブ数がQ3（110万→180万）とQ4（53.7万→49.4万）で大きく食い違う。

【時点のずれ】App Storeの順位は変動する（ReciMeは検証時に#7、メモでは11位）。Paprikaの移行時期は特定できる（paprikaapp.com/newsによると2026-09-28にオープンベータ、2026-11-06の正式版で任意のPremiumサブスクを導入）。メモの「移行時期は未確認」は更新できる。OpenAIのInstant Checkoutは、2026年3月時点では「moving away／moving to Apps」という方針転換の表明で、終了日は書かれていない。Skylightは製品ごとにPlusの価格が違う（Calendar Plusが年79ドル、Frame Plusが年39ドル）。Plan to Eatの記事は2026-10-07に更新されている。

【担当外だが気づいた点】[44]のTechCrunchにはInstant Checkoutや「初」という記述がない（1-3と1-4の「初のInstant Checkout」は要確認）。[32]のDigital TrendsにはSidekickの精度への批判がない（1-5の記述は根拠がない）。[9]は「創業者がNYへ移った」とあるだけで、本拠の移転とは書いていない。Ollieはテキストメッセージで家事を調整するAIアシスタントで、献立は機能の一つにすぎない（単体の献立アプリが淘汰された例としては言い過ぎ）。MetaはMuseの価格を公表していない（“subscription plans”とあるのみ）。Tescoの顧客向け展開は確認できていない。


</details>

## 04_complaints-and-failures.md（既存アプリへの不満と失敗事例）

照合 148件、確認済み 134件。

| 判定 | 箇所 | メモの記述 | 修正・補足 |
|---|---|---|---|
| 修正 | ## 0. 要点 1／1-1 表「価格・ペイウォール」行 | 価格・ペイウォールの言及率は 8 アプリ中 7 つで 20% 超（表の「20%超のアプリ 7/8」） | 20%を超えるのは6/8（AnyList 22.2%、eMeals、MPP、NYT 38.3%、ReciMe、Tasty 22.5%）。Paprika は18/90=20.0%ちょうどで、7/8になるのは「20%以上」で数えた場合。「20%以上が7/8」と書くべき。 |
| 修正 | ## 0. 要点 2 | 次に多いのは信頼性の問題：同期・ログイン不良（18%）、サポート無反応、買い物リストの重複・単位ミス、取り込み失敗（各 9〜10%）、買収・更新後の改悪 | 数値は再現した（バグ・同期・ログイン17.8%、サポート10.0%、買い物リスト10.3%、取り込み8.9%、改悪10.0%）。ただし分類はキーワードへの言及率で、ラベルが実態より具体的。「買い物リスト」は重複・単位ミスに限らず、同期不良、Walmart／Instacart連携、ウィジェット削除、Amazonへの共有なども含む。「サポート」も customer service への言及全般で、返金拒否が中心。「買い物リスト関連の不満」「サポートへの不満」とするのが正確。 |
| 修正 | ## 0. 要点 5 | （Yummly・Mealime・Ollie は）いずれもデータ移行が弱かった | Mealime は個人データを削除し、エクスポートもない。Yummly もエクスポートが限られていたとの利用者報告がある。一方 Ollie は全ユーザーにデータのエクスポートをテキストで送り、未使用分を返金すると告知しているので、「いずれも」は言い過ぎ。メモ3章も Ollie を「返金とデータ送付で対応」と書いており、要点と食い違う。「Mealime と Yummly はデータ移行が弱かった」とすべき。 |
| 修正 | 1-1 表 | サポート無反応 10%（20%超 2/8。Paprika 22%、eMeals 20%） | 平均10.0%と Paprika 20/90=22.2%は再現した。ただし eMeals は18/90=20.0%ちょうどで、20%超は1/8（20%以上なら2/8）。またこの分類は support／customer service への言及全般を数えている。eMeals の該当18件は返金拒否への不満が中心で、「無反応」とは限らない。「サポートへの不満」とするのが正確。 |
| 修正 | 1-1「平均★では不満が見えない」 | 対象アプリの平均★は 4.4〜4.9（例：NYT Cooking 4.91／約 55 万件。2026-11-08 時点） | NYT Cooking 4.91／549,882件（約55万件）は正しい。ただし分析対象の8アプリに限ると平均★は4.61（eMeals）〜4.91（NYT・Tasty）で4.6〜4.9。4.4台は対象外の Prepear 4.40、Cookpad 4.40、ChefGPT 4.44 で、出典[1–13]の13アプリ全体なら4.4〜4.9。 |
| 出典で確認できず | §2-1 表「2023-09 Amazon」行 | 同じ件で AI 生成とみられる「料理本」も問題になった（[23]） | [23] の Fortune 記事が挙げるのは、AI 執筆とみられるキノコ採集・同定本（ほかに旅行ガイド）だけで、料理本には触れていない。「キノコ本」に限定するか、料理本について別の出典を示す。 |
| 修正 | §2-1 表「2025-11-26 Fortune／Bloomberg」行 | （22 人の）検索流入が 30〜80% 減った | 記事に「30〜80%」という集計はない。並んでいるのは指標の異なる個別事例で、Google 流入 30% 減（Pinterest は 50% 減）、七面鳥レシピの流入が前年比 40% 減、カクテル系クエリのクリック率 30% 減、ある 1 人のブロガー（Clean Eating Kitchen）は 2 年で流入と収益の 80% を失った、というもの。「取材先の一部で流入が 30〜80% 減った事例がある」と書き換えるのが妥当（同 URL）。 |
| 修正 | §2-1 表「2026-10 NYT Cooking」行 | NYT Cooking の AI 機能について公式発表は未確認 | 公式の説明がある。NYT Cooking のシニアエディター Genevieve Ko が 2026-10-23 の Times Insider コラム（https://www.nytimes.com/2026/10/23/insider/cooking-recipes-ai.html）で、レシピに変更を加えられる新ツール（主に食材の置き換え。iOS の購読者から順次提供）を発表した。オフにできるかと問われ、Ko は「現時点ではできない」としつつ「使うかどうかは完全に任意」と答えた。Nieman Lab（2026-10-28）が報じている。ボタン名はレビューでしか確認できない。 |
| 修正 | ## 3 表・Yummly 行 | Yummly 終了の理由は「運営モデルの調整」 | 「adjusting its operating model」は、Whirlpool が 2024 年 4 月の Yummly 人員削減（“permanent reduction in Yummly employees”）について出した声明の文言。根拠は Moody on the Market の記事「Whirlpool Corp. cuts Yummly staff as part of “operating model adjustment”」https://www.moodyonthemarket.com/?p=235016 （本文は 403 で取得できず、検索結果のタイトルと抜粋で確認）。2024-12 の終了理由として Whirlpool が述べた一次資料は見つからない。終了理由として書いているのは競合 Plan to Eat の記事だけで、その記事のリンク先も人員削減の記事。正確には「2024 年 4 月の全員解雇の際、Whirlpool は『運営モデルの調整』と説明した」。 |
| 出典で確認できず | ## 3 表・Yummly 行 | Yummly のエクスポートは限定的だったとの報告がある（未精査） | 行の出典 [28][43][44] にはエクスポートの記述がない。検索で見つかったのは「一部のレシピだけ PDF で保存できた」とする低品質な二次情報だけ。Trustpilot に引用された Yummly の終了告知にもエクスポートの記載はない。レポートに残すなら「出典なし・未確認」と明記するか、削除する。 |
| 出典で確認できず | ## 3 表・PlateJoy 行 | PlateJoy（RVO Health）は 2025-07-01 に終了した（競合ブログによる。一次発表は未確認） | 記述はあるが、AI 献立アプリを売る競合 HowIEatHealthy のブログ 1 本だけで、出典リンクもない。PlateJoy／RVO Health の公式発表や報道は検索で見つからず、CB Insights は status を Alive と表示している。platejoy.com は本環境から到達できなかった（プロキシ 502）。Healthline の PlateJoy 紹介 URL からも PlateJoy の記述は消えているが、終了の証拠にはならない。レポートでは「終了したとの未確認情報がある」程度にとどめるか、削除する。 |
| 出典で確認できず | ## 3 表・2025 HelloFresh 行（教訓欄） | （HelloFresh 行の教訓）割引で獲得した顧客は定着しない | [55] には割引や定着率への言及がない（本文に discount も retention も出てこない）。書かれているのは「獲得を絞り、質の高い顧客を狙った結果、注文が減った」ことだけ。教訓として残すなら、筆者の解釈だと明記する。 |
| 修正 | ## 3 表・2026-10-21 Mealime 行 | 移行先を探す人の低評価が他アプリに続出した（「食料品チェーンに身売りした」[8]、「Mealime の代わりにならない」[1][9]） | 引用した 3 件は実在する（MealPrepPro 2026-09-27 ★1、Samsung Food 2026-11-04 ★1、eMeals 2026-11-04 ★1）。ただし「続出」は言い過ぎ。12 アプリ（Samsung Food、Paprika、AnyList、Eat This Much、NYT Cooking、Tasty、ReciMe、MealPrepPro、eMeals、Prepear、Plan to Eat、Cookpad）の米国の最新レビュー最大 500 件を見ると、2026-08 以降に Mealime に触れた★1–2 はこの 3 件しかない。しかも Samsung Food と eMeals の 2 件は同じ日付・同じ題名・同じ文体で、同一人物とみられる。正確には「移行先を試して不満を書いたレビューが数件ある」。教訓欄の「反感は強い」も、この件数では裏付けが弱い。 |
| 出典で確認できず | ## 4-2 の 3 | 飽きる：数週間で献立が繰り返し始める[4][9][16] | 繰り返しへの不満そのものは出典にある（Eat This Much の “same recipes 4-6 times a week”、eMeals の “the repeat of recipes is insane”、WaPo の “too repetitive”）。しかし「数週間で」始まるという時期を示す記述はどこにもない。正確には「献立の繰り返しへの不満が目立つ」。 |

<details><summary>検証者の所見（出典の質、スポンサー、時点のずれなど）</summary>

**C1**

担当範囲（## 0. 要点、1-1、1-2）の主張67件を検証した。内訳は supported 61件、corrected 6件。

【方法】App Store RSS を2026-11-08に13アプリ×10頁再取得し、メモ筆者の分類用正規表現（research/scripts/analyze2.py）を自前のスクリプトで再適用した。取得データは筆者の保存データと9アプリで完全一致した。計算は再現できたが、独立したサンプルではない。

【主な指摘】
(1) 「20%超のアプリ」は実際には「20%以上」で数えている。Paprika の価格（18/90）と eMeals のサポート（18/90）がちょうど20.0%。
(2) 分類はキーワードへの言及率なので、要点2の「買い物リストの重複・単位ミス」「サポート無反応」は実態より具体的なラベルになっている。AnyList の買い物リスト該当8件に重複・単位ミスの話はなく、eMeals のサポート該当は返金拒否が中心だった。
(3) 期間は「2025-01〜2026-11」と書かれているが、実際の範囲はアプリごとに大きく違う。ReciMe は2026-09-28以降、NYT は08-07以降、AnyList は01-27以降で、2025年1月まで遡れるのは Samsung・Paprika などに限られる。ReciMe は約6週間分で628件中227件を占める（平均は等重みなので影響は限定的）。
(4) NYT の9%→34%は10-13で区切った場合の値。急増は10-20〜29に集中し（50.7%）、11-01〜06は16.7%（4/24）まで下がっている。10-13以前の10月にも広告や縦型動画への低評価がある。
(5) NYT の AI 機能の導入とオフにできない点は Nieman Lab（2026-10-28。Genevieve Ko の10-23の記事を引用）で確認できる。2-1の「公式発表は未確認」は更新できる（担当範囲外）。
(6) 「冗談レベル」の出典である Samsung Food ★2レビューは、全体としては好意的（題名 Much improved、結び Highly recommended）。
(7) 要点5の「いずれもデータ移行が弱かった」は Ollie には当てはまらず、メモ3章とも矛盾する。
(8) 要点4の96.8%（NutriSteppe）は模擬プロフィール1万件によるアルゴリズム検証で、比較対象がない。「上がる」と言えるのは CARE（85.0→98.5%）だけ。また NutriSteppe の「数値の幻覚ゼロ」（2-2、範囲外）は抄録に見当たらない。
(9) 平均★4.4〜4.9は13アプリ全体の範囲で、分析対象の8アプリに限ると4.6〜4.9。

【競合・スポンサー関連の出典】
- Unstar[15]：レビュー分析ツールの販売企業で、サイトに『sponsored placements』を載せている。件数は非開示。★1–3、iOS＋Google Play、6アプリと手法も違うため、参考値扱いが妥当。
- Yummly 閉鎖の具体日（2024-12-20）：根拠は競合 Plan to Eat のブログ[43]だけ。Wikipedia は「2024年12月」としか書いていない。
- Plan to Eat の「広告なし」：App Store 説明文に明記がなく、未確認。「14日無料のあと年額サブスク」は確認できた。

【1-2の引用】28件すべてが RSS の原文と一字一句一致し、日付と★も一致した。WaPo、9to5Google、Trustpilot、Alexa、AI の学習利用の件も出典で確認した。


**C2**

【全体】§2 の主張 37 件を出典で確かめた。supported 34、corrected 2、unsupported 1。直すべきは次の 3 点。
(1) Fortune／Bloomberg（2025-11-26）の「検索流入が 30〜80% 減」：記事にこの集計はない。Google 流入 30% 減、レシピ流入が前年比 40% 減、クリック率 30% 減、1 人のブロガーが 2 年で流入と収益の 80% を失った、という指標の異なる個別事例が並んでいるだけ。
(2) Amazon の件の「料理本」：[23] Fortune 2023-09-03 はキノコ本と旅行ガイドしか挙げていない。
(3) NYT Cooking の「公式発表は未確認」：Genevieve Ko の Times Insider コラム（2026-10-23）があり、Nieman Lab（2026-10-28）が報じている。Ko は、オフにはできないが使うかどうかは任意、と答えた。同記事の「約 77% が否定的」は、筆者がコメント 171 件を AI で感情分析した数字で、調査ではない。使うなら注記が要る。

【書誌】論文 14 本の誌名・年月・DOI は Europe PMC／arXiv API で全件一致した。メモの年月はオンライン公開日。印刷版は Niszczota が Nutrition 112（2023-08）、Hieronimus が Nutr Res 128:105-114（2024-08）、Bayram が Nutr Health 31(4)（2025-12、DOI 10.1177/02601060251329070）。4/56（7.1%）とアーモンドミルクの例は抄録になく、Fox News で確認した。ScienceDirect の全文は 403 で読めなかった。

【出典の偏り・注意】
- §2 に競合企業のブログやスポンサー付き調査はない。
- CARE（85%→98.5%）と NutriSteppe（96.8%、数値の幻覚ゼロ）は開発者自身の評価。CARE は 1.5B モデルと自作の CAREBench-150、NutriSteppe は 1 万人の模擬プロフィールで評価し、エネルギーの MAE は 11.6%。素の LLM を調べた研究とは比べられない。「企画への示唆」2 のように「検証層を足せば 85%→98.5%」と一般化するのは言い過ぎ。
- NutriGen と FoodGuardBench は査読前の arXiv。NutriGen の数値は最良 2 モデルの値。FoodGuardBench の 55.8% と 97.6% は別の指標（検出精度と OOD 精度）。
- 次の 3 点は利害当事者か二次情報。
 ・Fortune の 22 人と PPC Land の検証は、流入を失ったクリエイター本人の申告や動画に基づく。
 ・Guardian（取得不可）は Futurism 経由、CNN（HTTP 451）は Let's Data Science 経由でしか確認できなかった。
 ・NYT のボタン名と Botatouille への苦情は App Store レビュー（2023〜2024 年の投稿）だけが根拠。

【補足】「ピザに糊」の誤答は 2024-05（SiliconANGLE 2024-05-23 ほか）。


**C3**

【全体】担当範囲（§3・§4）の主張 43 件を確認した。supported 37、corrected 3（Yummly の終了理由の文脈、Mealime の「続出」、なし→計 2 件＋下記）、unsupported 4（Yummly のエクスポート、PlateJoy の終了日、HelloFresh 行の教訓、§4-2-3 の「数週間で」）。数値と日付（売却額、損失、売上・注文の増減、終了日、RevenueCat と JMIR の数値、NYT の 9%→34%）は、重大な誤りなく出典どおりだった。

【競合ブログ・利害関係のある出典】
- [43] Plan to Eat（競合）が Yummly の終了日と理由の主な根拠になっている。理由の文言は、元は 2024 年 4 月の人員削減時の声明。
- [48] Ultimate Meal Plans（Paleo Meal Plans LLC。競合、自社推薦）：Mealime の件。ただし一次情報の閉鎖告知 [47] で裏付けが取れる。
- [51] Carly（AI アシスタントを売る競合）は「Ollie は理由を示していない」と書いており、CEO の発言を報じた TechCrunch と食い違う。理由は TechCrunch を使うこと。
- [52] HowIEatHealthy（AI 献立アプリ）：PlateJoy 終了の唯一の根拠で、出典の記載がない。
- [62] は CookifyAI の製品ページ上の質問投稿、[61] は self-promotion 板の投稿、[63] は Plan to Eat の自社ブログ。
- RevenueCat [59][60] はサブスク課金基盤の販売企業で、データは同社の顧客アプリに限られる。業界中立の標本ではない。
- 担当範囲にスポンサー付き調査は見当たらなかった。

【RevenueCat の版の違い】2026 年版（2025 年データ）では、1 年継続率の中央値が年額 28%・月額 8%（AI アプリの年額は 21.1%、非 AI は 30.7%）。カテゴリ別返金率は Productivity の 4.7% が最高で、大半は 3〜4%。2025 年版の 44.1%／17.0%／H&F 4.71% と混ぜて「最新値」として並べないこと。H&F 区分は Health & Fitness と Medical だけで、Food & Drink の献立アプリは含まれない。[57] は慢性疾患向けアプリ、[58] は Android のメンタルヘルスアプリが対象で、献立アプリの代理指標としては限界がある。

【補強情報】
- NYT Cooking の AI 機能は Nieman Lab（2026-10-28。NYT の 2026-10-23 の記事を引用）で確認できた。iOS 向けにレシピ変更（主に食材の置き換え）を行う AI ツールを公開し、オプトアウトは「現時点ではない」。コメント 171 件の 77% が否定的。§2-1 の「公式発表は未確認」はこれで補える：https://www.niemanlab.org/2026/10/the-new-york-times-is-adding-more-ai-features-to-its-cooking-app-and-users-arent-thrilled/
- Blue Apron の売却完了日は 2023-11-13（Supermarket News）：https://supermarketnews.com/grocery-technology/wonder-completes-acquisition-of-blue-apron-for-103m
- People Inc. は 2025-07-31 に Dotdash Meredith から改称した、Allrecipes の運営会社。MyRecipes はバージョン履歴上 1.0.0 が 2026-08-17 付だが、公開日（releaseDate）は 2026-08-27。
- Ollie の調達額は、Caplight が「2026-09-04、800 万ドル」と別の値を載せている。TechCrunch と American Bazaar は 750 万ドル。
- Yummly の温度計アプリは 2024-12-18 に停止（Trustpilot に引用された告知による）。

【範囲外だが関連】§0 の要点 5「いずれもデータ移行が弱かった」は Ollie には当てはまらない。Ollie はデータを SMS でエクスポート送付し、返金も行っている。

【取得できなかったもの】
- Restaurant Business [54]：403。
- Moody on the Market：403。ブラウザ UA での再取得はポリシーで拒否されたため行っていない。
- platejoy.com：プロキシ 502。確認するにはネットワーク設定で許可が要る。
- Wayback Machine：429。


</details>

## 追記（最終レビュー）

最終レビュー（2026年11月8日）で、次の3点を出典で確かめた。上の照合件数（729件）には含めていない。

| 項目 | 確かめたこと | 出典 |
|---|---|---|
| UNEPの「家庭で1日10億食超」（03の表の「出典で確認できず」） | UNEPの発表に、家庭の数字として書かれていることを確認した。レポート2-3の記述は正しい | [UNEPのプレスリリース](https://www.unep.org/news-and-stories/press-release/world-squanders-over-1-billion-meals-day-un-report) |
| RevenueCatの1年継続率（年額28%・月額8%） | 2024年に始まった購読の1年継続率である。2023年に始まった購読では31%・10%だった。レポート4-5の書き方をこれに合わせた | [RevenueCat「State of Subscription Apps 2026」part 2](https://www.revenuecat.com/sosa-2026-insights-part-2) |
| NYT CookingのAI機能（04の表の「公式発表は未確認」の行） | 公式の説明は、NYT CookingのシニアエディターGenevieve KoによるTimes Insiderのコラム（2026年10月23日）にある。レシピを変える機能（主に食材の置き換え）をiOSの購読者から順に提供し、今はオフにできないが、使うかどうかは任意だと説明した。Nieman Lab（2026年10月28日）が報じた | [Times Insider](https://www.nytimes.com/2026/10/23/insider/cooking-recipes-ai.html)、[Nieman Lab](https://www.niemanlab.org/2026/10/the-new-york-times-is-adding-more-ai-features-to-its-cooking-app-and-users-arent-thrilled/) |

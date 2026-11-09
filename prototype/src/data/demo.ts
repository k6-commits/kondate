// デモの家族。画面（「デモの家族で始める」）と LINE サーバー（友だち追加・グループ参加のとき）で共通に使う。
// 大人2、小学生1、幼児1。小学生の子が卵アレルギー（DESIGN.md「6. 受け入れ条件」）。
import type { OnboardingInput } from '../engine/types';

export const DEMO_ONBOARDING: OnboardingInput = {
  members: [
    { nickname: 'ママ', ageBand: 'adult', role: 'parent', exclusions: [] },
    { nickname: 'パパ', ageBand: 'adult', role: 'partner', exclusions: [] },
    { nickname: 'はると', ageBand: 'child', role: 'child', exclusions: [{ type: 'allergen', id: 'egg' }] },
    { nickname: 'ゆい', ageBand: 'preschool', role: 'child', exclusions: [] },
  ],
  shoppingWeekdays: [1, 4], // 月・木
  // 卵を使わず、要確認の加工品も使わない定番（たんぱく源と和洋中をばらしてある）。
  favoriteDishIds: [
    'shogayaki', // 豚の生姜焼き
    'chicken_teriyaki', // 鶏の照り焼き
    'karaage', // 鶏の唐揚げ
    'nikujaga', // 肉じゃが
    'salmon_shioyaki', // 鮭の塩焼き
    'saba_miso', // さばの味噌煮
    'keema_curry', // キーマカレー
    'niku_dofu', // 肉豆腐
    'pork_cabbage_miso', // 豚キャベツの味噌炒め
  ],
  customFavoriteNames: [],
  plan: 'free',
};

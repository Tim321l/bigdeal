import type { ActionType, Card, PropertyColor, TurnPhase } from './types';

export const COLOR_LABELS: Record<PropertyColor, string> = {
  PUBLIC_HOUSING: '公共屋邨',
  OLD_TONG_LAU: '舊式唐樓',
  ESTATE: '大型屋苑',
  COMMERCIAL_LUXURY: '頂級商廈',
  TRANSPORT: '交通基建',
};

export const ACTION_LABELS: Record<ActionType, string> = {
  DEAL_BREAKER: '強制收樓',
  JUST_SAY_NO: '封區',
  SLY_DEAL: '市建局強拍',
  FORCED_DEAL: '移民盤劈價',
  DEBT_COLLECTOR: '收數',
  BIRTHDAY: '圍標維修',
  PASS_GO: '過龍',
  HOUSE: '洋樓',
  HOTEL: '酒店',
  DOUBLE_RENT: '孖展炒樓',
  PICKPOCKET: '打荷包',
  NAIL_HOUSE: '釘子戶',
  MARKET_TOP: '炒家摸頂',
  RENOVATION_SCAM: '圍標天價維修',
  HAUNTED_RUMOR: '凶宅傳聞',
  ASSET_REORG: '物業重組',
  ATM_WITHDRAWAL: '提款機壞咗',
  MONEY_LAUNDERING: '洗黑錢',
  LIQUIDATOR_TAKEOVER: '接管清盤人',
  REVERSE_MORTGAGE: '逆按揭',
};

export const PHASE_LABELS: Record<TurnPhase, string> = {
  TURN_START: '待抽牌',
  ACTION: '行動中',
  REACTION_WINDOW: '等待回應',
  TURN_END: '回合結束',
  GAME_OVER: '遊戲結束',
  AUCTION: '暗標拍賣中',
  ROLL: '待擲骰',
  TILE_DECISION: '等待地格決定',
};

/** Plain-language explanation of what playing each action card actually does. */
export const ACTION_DESCRIPTIONS: Record<ActionType, string> = {
  DEAL_BREAKER: '搶走一位對手已經集齊嘅一整套物業(連埋洋樓/酒店都一齊攞埋)。',
  SLY_DEAL: '由對手度攞走一張物業——嗰套一定唔可以係已經集齊嘅。',
  FORCED_DEAL: '同對手交換一張物業,雙方嗰張都唔可以係已集齊嘅套。',
  DEBT_COLLECTOR: '逼一位對手即刻俾你 $5M(佢有幾多俾幾多,唔夠都要俾晒)。',
  BIRTHDAY: '所有對手都要各俾你 $2M。',
  PASS_GO: '即刻多抽 2 張牌。',
  HOUSE: '裝喺自己一套已集齊嘅物業度(交通基建唔得),之後嗰套收租 +$3M,要未起過洋樓先得。',
  HOTEL: '裝喺已經有洋樓嘅套度,之後嗰套收租再 +$4M。',
  DOUBLE_RENT: '令你今個回合出嘅下一張租單金額變雙倍。',
  JUST_SAY_NO: '唯一可以拒絕對手招式嘅方法——輪到你回應嗰陣打出嚟可以抵消件事(包括收租、搶樓)。冇呢張卡就乜都要接受。',
  PICKPOCKET: '揀一位對手,隨機由佢手牌摸走一張(唔係物業,係手牌本身)。',
  NAIL_HOUSE: '裝喺自己一種已經有物業嘅顏色度,之後嗰套永久唔會俾強制收樓/市建局強拍/移民盤劈價/凶宅傳聞搶走或者郁到(圍標天價維修唔受呢個保護)。',
  MARKET_TOP: '唔可以主動打出——收租/圍標維修/收數要你俾錢嗰陣先可以用嚟反擊:唔使俾,仲要對方倒過來俾返同額俾你。',
  RENOVATION_SCAM: '揀一位對手一套有洋樓或者酒店嘅物業,強制拆走佢嘅洋樓/酒店(改善)加成。',
  HAUNTED_RUMOR: '揀一位對手一張物業(就算已經集齊套都得),強制棄咗嗰張,可以拆散對手已集齊嘅套。',
  ASSET_REORG: '揀自己銀行入面一張物業/洋樓/酒店,搬去物業區即時生效(要符合起樓/成套規則)——救返之前逼住入咗銀行嘅好卡。',
  ATM_WITHDRAWAL: '由自己銀行攞返 1-2 張非現金卡(租單/功能卡)入手牌,可以再次打出嚟用。',
  MONEY_LAUNDERING: '揀自己銀行入面一張租單卡,即場發動收租(唔使用手牌位),收完就棄咗嗰張租單。',
  LIQUIDATOR_TAKEOVER: '揀一位對手,由佢銀行攞走一張非現金卡(功能卡/租單/物業)入你手牌——銀行入面嘅嘢人人見到,唔怕估錯。',
  REVERSE_MORTGAGE: '揀自己銀行入面一張非現金卡放返落牌組最底,即刻補抽 3 張新手牌。',
};

/** Full plain-language description of any card, for a click-to-explain popover. */
export function describeCard(card: Card): string {
  if (card.type === 'PROPERTY' && card.color) {
    return `「${COLOR_LABELS[card.color]}」物業。同色集齊 3 張就完成一套,係贏遊戲嘅條件。`;
  }
  if (card.type === 'RENT' && card.color) {
    return `打出嚟即時同所有對手收「${COLOR_LABELS[card.color]}」嘅租,金額按你自己擁有幾多張嗰種顏色計。`;
  }
  if (card.type === 'RENT' && card.wildColors) {
    const colorNames = card.wildColors.map((c) => COLOR_LABELS[c]).join('、');
    return card.rentScope === 'SINGLE'
      ? `萬能租單——揀一位對手同任何一種顏色(${colorNames}),淨係向嗰位對手收租。`
      : `通用租單——打出時揀「${colorNames}」其中一種顏色,同所有對手收嗰種顏色嘅租。`;
  }
  if (card.type === 'MONEY') {
    return '純現金,冇特殊能力,存入銀行等於面值。';
  }
  if (card.type === 'ACTION' && card.actionType) {
    return ACTION_DESCRIPTIONS[card.actionType];
  }
  return '呢張卡冇特別說明。';
}

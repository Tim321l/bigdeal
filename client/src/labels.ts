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
};

export const PHASE_LABELS: Record<TurnPhase, string> = {
  TURN_START: '待抽牌',
  ACTION: '行動中',
  REACTION_WINDOW: '等待回應',
  TURN_END: '回合結束',
  GAME_OVER: '遊戲結束',
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
};

/** Full plain-language description of any card, for a click-to-explain popover. */
export function describeCard(card: Card): string {
  if (card.type === 'PROPERTY' && card.color) {
    return `「${COLOR_LABELS[card.color]}」物業。同色集齊 3 張就完成一套,係贏遊戲嘅條件。`;
  }
  if (card.type === 'RENT' && card.color) {
    return `打出嚟即時同所有對手收「${COLOR_LABELS[card.color]}」嘅租,金額按你自己擁有幾多張嗰種顏色計。`;
  }
  if (card.type === 'MONEY') {
    return '純現金,冇特殊能力,存入銀行等於面值。';
  }
  if (card.type === 'ACTION' && card.actionType) {
    return ACTION_DESCRIPTIONS[card.actionType];
  }
  return '呢張卡冇特別說明。';
}

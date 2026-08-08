import type { ActionType, PropertyColor, TurnPhase } from './types';

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

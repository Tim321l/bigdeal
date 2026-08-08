import type { MacroEvent } from '../types/game';

export const MACRO_EVENTS: MacroEvent[] = [
  {
    id: 'rate-hike',
    name: '突發加息',
    description: '銀行大幅上調按揭利率，地產交易降溫，所有租金收入減半。',
    durationTurns: 3,
    modifiers: [{ target: 'RENT', operator: 'MULTIPLY', value: 0.5 }],
  },
  {
    id: 'stamp-duty-removal',
    name: '全面撤辣',
    description: '政府撤銷樓市辣招，交投轉旺，每回合可多打兩張牌。',
    durationTurns: 3,
    modifiers: [{ target: 'ACTION_LIMIT', operator: 'ADD', value: 2 }],
  },
  {
    id: 'typhoon-signal-8',
    name: '八號風球',
    description: '天文台懸掛八號風球，全城停工停市。當前玩家停一個回合，並抽兩張防禦牌應急。',
    durationTurns: 1,
    modifiers: [],
    specialEffects: [{ effect: 'SKIP_TURN' }, { effect: 'DRAW_DEFENSIVE_CARDS', count: 2 }],
  },
  {
    id: 'budget-handout',
    name: '財政預算案派糖',
    description: '政府公布派糖措施，每位玩家銀行戶口即時獲發 $2M。',
    durationTurns: 1,
    modifiers: [],
    specialEffects: [{ effect: 'GRANT_BANK_ALL', amount: 2 }],
  },
  {
    id: 'land-auction-failed',
    name: '賣地流標',
    description: '政府賣地流標，市場信心受挫，未集齊全套的物業組合暫停收租。',
    durationTurns: 4,
    modifiers: [],
    specialEffects: [{ effect: 'DISABLE_INCOMPLETE_SET_RENT' }],
  },
  {
    id: 'black-rainstorm',
    name: '黑色暴雨警告',
    description: '天文台發出黑色暴雨警告，交易文件被雨水浸壞，人人隨機棄一張手牌。',
    durationTurns: 1,
    modifiers: [],
    specialEffects: [{ effect: 'DISCARD_RANDOM_ALL' }],
  },
];

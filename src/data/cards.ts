import type { Card } from '../types/game';

export const PROPERTY_CARDS: Card[] = [
  // PUBLIC_HOUSING — 公共屋邨，樓齡老、租金相宜
  { id: 'public-housing-tin-shing-yuen', name: '天盛苑', type: 'PROPERTY', value: 1, color: 'PUBLIC_HOUSING', rentTiers: [1, 2, 4] },
  { id: 'public-housing-yau-oi-estate', name: '友愛邨', type: 'PROPERTY', value: 1, color: 'PUBLIC_HOUSING', rentTiers: [1, 2, 4] },
  { id: 'public-housing-ngau-tau-kok-lower-estate', name: '牛頭角下邨', type: 'PROPERTY', value: 1, color: 'PUBLIC_HOUSING', rentTiers: [1, 2, 4] },

  // OLD_TONG_LAU — 舊式唐樓，市集林立
  { id: 'tong-lau-apliu-street', name: '鴨寮街', type: 'PROPERTY', value: 2, color: 'OLD_TONG_LAU', rentTiers: [1, 3, 5] },
  { id: 'tong-lau-ladies-market', name: '女人街', type: 'PROPERTY', value: 2, color: 'OLD_TONG_LAU', rentTiers: [1, 3, 5] },
  { id: 'tong-lau-nga-tsin-wai-road', name: '衙前圍道', type: 'PROPERTY', value: 2, color: 'OLD_TONG_LAU', rentTiers: [1, 3, 5] },

  // ESTATE — 大型私人屋苑
  { id: 'estate-taikoo-shing', name: '太古城', type: 'PROPERTY', value: 3, color: 'ESTATE', rentTiers: [2, 4, 6] },
  { id: 'estate-mei-foo-sun-chuen', name: '美孚新邨', type: 'PROPERTY', value: 3, color: 'ESTATE', rentTiers: [2, 4, 6] },
  { id: 'estate-city-one', name: '第一城', type: 'PROPERTY', value: 3, color: 'ESTATE', rentTiers: [2, 4, 6] },

  // COMMERCIAL_LUXURY — 頂級商業/豪宅地段
  { id: 'commercial-ifc', name: 'IFC', type: 'PROPERTY', value: 4, color: 'COMMERCIAL_LUXURY', rentTiers: [3, 6, 9] },
  { id: 'commercial-k11', name: 'K11', type: 'PROPERTY', value: 4, color: 'COMMERCIAL_LUXURY', rentTiers: [3, 6, 9] },
  { id: 'commercial-sze-fan-road', name: '施勳道', type: 'PROPERTY', value: 4, color: 'COMMERCIAL_LUXURY', rentTiers: [3, 6, 9] },

  // TRANSPORT — 交通基建
  { id: 'transport-island-line', name: '港島線', type: 'PROPERTY', value: 2, color: 'TRANSPORT', rentTiers: [1, 2, 4] },
  { id: 'transport-interchange-station', name: '轉車站', type: 'PROPERTY', value: 2, color: 'TRANSPORT', rentTiers: [1, 2, 4] },
  { id: 'transport-third-runway', name: '三跑', type: 'PROPERTY', value: 2, color: 'TRANSPORT', rentTiers: [1, 2, 4] },
];

export const ACTION_CARDS: Card[] = [
  { id: 'action-deal-breaker', name: '強制收樓', type: 'ACTION', value: 5, actionType: 'DEAL_BREAKER' },
  { id: 'action-sly-deal', name: '市建局強拍', type: 'ACTION', value: 3, actionType: 'SLY_DEAL' },
  { id: 'action-birthday', name: '圍標維修', type: 'ACTION', value: 2, actionType: 'BIRTHDAY' },
  { id: 'action-forced-deal', name: '移民盤劈價', type: 'ACTION', value: 4, actionType: 'FORCED_DEAL' },
  { id: 'action-just-say-no', name: '封區', type: 'ACTION', value: 4, actionType: 'JUST_SAY_NO' },
  { id: 'action-double-rent', name: '孖展炒樓', type: 'ACTION', value: 1, actionType: 'DOUBLE_RENT' },
  // Classic Monopoly Deal cards, HK-flavoured: 收數 forces one player to pay you $5M (card is
  // worth $3M if banked); 洋樓/酒店 attach to one of your own complete sets to boost its rent;
  // 過龍 draws you 2 extra cards.
  { id: 'action-debt-collector', name: '收數', type: 'ACTION', value: 3, actionType: 'DEBT_COLLECTOR' },
  { id: 'action-house', name: '洋樓', type: 'ACTION', value: 3, actionType: 'HOUSE' },
  { id: 'action-hotel', name: '酒店', type: 'ACTION', value: 4, actionType: 'HOTEL' },
  { id: 'action-pass-go', name: '過龍', type: 'ACTION', value: 1, actionType: 'PASS_GO' },
];

// RENT cards let the active player charge rent for a color they own; the amount is looked up
// from their own property cards' rentTiers (see stateManager.ts), not stored on the RENT card.
export const RENT_CARDS: Card[] = [
  { id: 'rent-public-housing', name: '公屋租單', type: 'RENT', value: 1, color: 'PUBLIC_HOUSING' },
  { id: 'rent-old-tong-lau', name: '唐樓租單', type: 'RENT', value: 1, color: 'OLD_TONG_LAU' },
  { id: 'rent-estate', name: '屋苑租單', type: 'RENT', value: 1, color: 'ESTATE' },
  { id: 'rent-commercial-luxury', name: '豪宅租單', type: 'RENT', value: 1, color: 'COMMERCIAL_LUXURY' },
  { id: 'rent-transport', name: '交通租單', type: 'RENT', value: 1, color: 'TRANSPORT' },
];

export const CARDS: Card[] = [...PROPERTY_CARDS, ...ACTION_CARDS, ...RENT_CARDS];

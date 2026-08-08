import type { Card } from '../types/game';

// 5 named buildings per color (up from the original 3) — real Monopoly Deal prints 28 property
// cards across its 10 colors, and 3-in-5-colors proved too thin once multiple players (or bots)
// are drawing from the same shared pool. COMPLETE_SET_SIZE is still 3, so the extra 2 per color
// are redundancy/liquidity, not a bigger win requirement.
export const PROPERTY_CARDS: Card[] = [
  // PUBLIC_HOUSING — 公共屋邨，樓齡老、租金相宜
  { id: 'public-housing-tin-shing-yuen', name: '天盛苑', type: 'PROPERTY', value: 1, color: 'PUBLIC_HOUSING', rentTiers: [1, 2, 4] },
  { id: 'public-housing-yau-oi-estate', name: '友愛邨', type: 'PROPERTY', value: 1, color: 'PUBLIC_HOUSING', rentTiers: [1, 2, 4] },
  { id: 'public-housing-ngau-tau-kok-lower-estate', name: '牛頭角下邨', type: 'PROPERTY', value: 1, color: 'PUBLIC_HOUSING', rentTiers: [1, 2, 4] },
  { id: 'public-housing-shek-lei-estate', name: '石籬邨', type: 'PROPERTY', value: 1, color: 'PUBLIC_HOUSING', rentTiers: [1, 2, 4] },
  { id: 'public-housing-choi-hung-estate', name: '彩虹邨', type: 'PROPERTY', value: 1, color: 'PUBLIC_HOUSING', rentTiers: [1, 2, 4] },

  // OLD_TONG_LAU — 舊式唐樓，市集林立
  { id: 'tong-lau-apliu-street', name: '鴨寮街', type: 'PROPERTY', value: 2, color: 'OLD_TONG_LAU', rentTiers: [1, 3, 5] },
  { id: 'tong-lau-ladies-market', name: '女人街', type: 'PROPERTY', value: 2, color: 'OLD_TONG_LAU', rentTiers: [1, 3, 5] },
  { id: 'tong-lau-nga-tsin-wai-road', name: '衙前圍道', type: 'PROPERTY', value: 2, color: 'OLD_TONG_LAU', rentTiers: [1, 3, 5] },
  { id: 'tong-lau-wan-chai-blue-house', name: '灣仔藍屋', type: 'PROPERTY', value: 2, color: 'OLD_TONG_LAU', rentTiers: [1, 3, 5] },
  { id: 'tong-lau-ki-lung-street', name: '深水埗基隆街', type: 'PROPERTY', value: 2, color: 'OLD_TONG_LAU', rentTiers: [1, 3, 5] },

  // ESTATE — 大型私人屋苑
  { id: 'estate-taikoo-shing', name: '太古城', type: 'PROPERTY', value: 3, color: 'ESTATE', rentTiers: [2, 4, 6] },
  { id: 'estate-mei-foo-sun-chuen', name: '美孚新邨', type: 'PROPERTY', value: 3, color: 'ESTATE', rentTiers: [2, 4, 6] },
  { id: 'estate-city-one', name: '第一城', type: 'PROPERTY', value: 3, color: 'ESTATE', rentTiers: [2, 4, 6] },
  { id: 'estate-south-horizons', name: '海怡半島', type: 'PROPERTY', value: 3, color: 'ESTATE', rentTiers: [2, 4, 6] },
  { id: 'estate-kingswood-villas', name: '嘉湖山莊', type: 'PROPERTY', value: 3, color: 'ESTATE', rentTiers: [2, 4, 6] },

  // COMMERCIAL_LUXURY — 頂級商業/豪宅地段
  { id: 'commercial-ifc', name: 'IFC', type: 'PROPERTY', value: 4, color: 'COMMERCIAL_LUXURY', rentTiers: [3, 6, 9] },
  { id: 'commercial-k11', name: 'K11', type: 'PROPERTY', value: 4, color: 'COMMERCIAL_LUXURY', rentTiers: [3, 6, 9] },
  { id: 'commercial-sze-fan-road', name: '施勳道', type: 'PROPERTY', value: 4, color: 'COMMERCIAL_LUXURY', rentTiers: [3, 6, 9] },
  { id: 'commercial-pacific-place', name: '太古廣場', type: 'PROPERTY', value: 4, color: 'COMMERCIAL_LUXURY', rentTiers: [3, 6, 9] },
  { id: 'commercial-the-center', name: '中環中心', type: 'PROPERTY', value: 4, color: 'COMMERCIAL_LUXURY', rentTiers: [3, 6, 9] },

  // TRANSPORT — 交通基建
  { id: 'transport-island-line', name: '港島線', type: 'PROPERTY', value: 2, color: 'TRANSPORT', rentTiers: [1, 2, 4] },
  { id: 'transport-interchange-station', name: '轉車站', type: 'PROPERTY', value: 2, color: 'TRANSPORT', rentTiers: [1, 2, 4] },
  { id: 'transport-third-runway', name: '三跑', type: 'PROPERTY', value: 2, color: 'TRANSPORT', rentTiers: [1, 2, 4] },
  { id: 'transport-high-speed-rail', name: '高鐵西九龍站', type: 'PROPERTY', value: 2, color: 'TRANSPORT', rentTiers: [1, 2, 4] },
  { id: 'transport-tsing-ma-bridge', name: '青馬大橋', type: 'PROPERTY', value: 2, color: 'TRANSPORT', rentTiers: [1, 2, 4] },
];

// Counts mirror real Monopoly Deal's action-card print run almost exactly (Pass Go x10, Forced
// Deal x4, Sly Deal/Birthday/Debt Collector/House x3, Just Say No x3, Deal Breaker/Hotel/Double
// Rent x2) — the original single-copy set made every action a one-shot resource for the whole
// game, which is far scarcer than the real game's economy.
export const ACTION_CARDS: Card[] = [
  { id: 'action-deal-breaker', name: '強制收樓', type: 'ACTION', value: 5, actionType: 'DEAL_BREAKER' },
  { id: 'action-deal-breaker-2', name: '強制收樓', type: 'ACTION', value: 5, actionType: 'DEAL_BREAKER' },

  { id: 'action-sly-deal', name: '市建局強拍', type: 'ACTION', value: 3, actionType: 'SLY_DEAL' },
  { id: 'action-sly-deal-2', name: '市建局強拍', type: 'ACTION', value: 3, actionType: 'SLY_DEAL' },
  { id: 'action-sly-deal-3', name: '市建局強拍', type: 'ACTION', value: 3, actionType: 'SLY_DEAL' },

  { id: 'action-birthday', name: '圍標維修', type: 'ACTION', value: 2, actionType: 'BIRTHDAY' },
  { id: 'action-birthday-2', name: '圍標維修', type: 'ACTION', value: 2, actionType: 'BIRTHDAY' },
  { id: 'action-birthday-3', name: '圍標維修', type: 'ACTION', value: 2, actionType: 'BIRTHDAY' },

  { id: 'action-forced-deal', name: '移民盤劈價', type: 'ACTION', value: 4, actionType: 'FORCED_DEAL' },
  { id: 'action-forced-deal-2', name: '移民盤劈價', type: 'ACTION', value: 4, actionType: 'FORCED_DEAL' },
  { id: 'action-forced-deal-3', name: '移民盤劈價', type: 'ACTION', value: 4, actionType: 'FORCED_DEAL' },
  { id: 'action-forced-deal-4', name: '移民盤劈價', type: 'ACTION', value: 4, actionType: 'FORCED_DEAL' },

  { id: 'action-just-say-no', name: '封區', type: 'ACTION', value: 4, actionType: 'JUST_SAY_NO' },
  { id: 'action-just-say-no-2', name: '封區', type: 'ACTION', value: 4, actionType: 'JUST_SAY_NO' },
  { id: 'action-just-say-no-3', name: '封區', type: 'ACTION', value: 4, actionType: 'JUST_SAY_NO' },

  { id: 'action-double-rent', name: '孖展炒樓', type: 'ACTION', value: 1, actionType: 'DOUBLE_RENT' },
  { id: 'action-double-rent-2', name: '孖展炒樓', type: 'ACTION', value: 1, actionType: 'DOUBLE_RENT' },

  { id: 'action-debt-collector', name: '收數', type: 'ACTION', value: 3, actionType: 'DEBT_COLLECTOR' },
  { id: 'action-debt-collector-2', name: '收數', type: 'ACTION', value: 3, actionType: 'DEBT_COLLECTOR' },
  { id: 'action-debt-collector-3', name: '收數', type: 'ACTION', value: 3, actionType: 'DEBT_COLLECTOR' },

  // 4 colors can be improved (TRANSPORT can't — see NO_IMPROVEMENT_COLOR), each capped at one
  // house + one hotel, so 5 house / 4 hotel gives enough supply for every player to plausibly
  // land one of each on the sets they complete, instead of the cards running out too early.
  { id: 'action-house', name: '洋樓', type: 'ACTION', value: 3, actionType: 'HOUSE' },
  { id: 'action-house-2', name: '洋樓', type: 'ACTION', value: 3, actionType: 'HOUSE' },
  { id: 'action-house-3', name: '洋樓', type: 'ACTION', value: 3, actionType: 'HOUSE' },
  { id: 'action-house-4', name: '洋樓', type: 'ACTION', value: 3, actionType: 'HOUSE' },
  { id: 'action-house-5', name: '洋樓', type: 'ACTION', value: 3, actionType: 'HOUSE' },

  { id: 'action-hotel', name: '酒店', type: 'ACTION', value: 4, actionType: 'HOTEL' },
  { id: 'action-hotel-2', name: '酒店', type: 'ACTION', value: 4, actionType: 'HOTEL' },
  { id: 'action-hotel-3', name: '酒店', type: 'ACTION', value: 4, actionType: 'HOTEL' },
  { id: 'action-hotel-4', name: '酒店', type: 'ACTION', value: 4, actionType: 'HOTEL' },

  // 過龍 is the low-impact "draw 2" filler card — real Monopoly Deal prints 10 of it, by far
  // the most common action card, keeping the deck moving without much strategic weight.
  { id: 'action-pass-go-1', name: '過龍', type: 'ACTION', value: 1, actionType: 'PASS_GO' },
  { id: 'action-pass-go-2', name: '過龍', type: 'ACTION', value: 1, actionType: 'PASS_GO' },
  { id: 'action-pass-go-3', name: '過龍', type: 'ACTION', value: 1, actionType: 'PASS_GO' },
  { id: 'action-pass-go-4', name: '過龍', type: 'ACTION', value: 1, actionType: 'PASS_GO' },
  { id: 'action-pass-go-5', name: '過龍', type: 'ACTION', value: 1, actionType: 'PASS_GO' },
  { id: 'action-pass-go-6', name: '過龍', type: 'ACTION', value: 1, actionType: 'PASS_GO' },
  { id: 'action-pass-go-7', name: '過龍', type: 'ACTION', value: 1, actionType: 'PASS_GO' },
  { id: 'action-pass-go-8', name: '過龍', type: 'ACTION', value: 1, actionType: 'PASS_GO' },
  { id: 'action-pass-go-9', name: '過龍', type: 'ACTION', value: 1, actionType: 'PASS_GO' },
  { id: 'action-pass-go-10', name: '過龍', type: 'ACTION', value: 1, actionType: 'PASS_GO' },
];

// RENT cards let the active player charge rent for a color they own; the amount is looked up
// from their own property cards' rentTiers (see stateManager.ts), not stored on the RENT card.
// 3 copies per color — real Monopoly Deal's rent cards are 2-color wilds (13 total across 10
// colors); ours are single-color, so 3 copies × 5 colors keeps a comparable per-color supply.
export const RENT_CARDS: Card[] = [
  { id: 'rent-public-housing', name: '公屋租單', type: 'RENT', value: 1, color: 'PUBLIC_HOUSING' },
  { id: 'rent-public-housing-2', name: '公屋租單', type: 'RENT', value: 1, color: 'PUBLIC_HOUSING' },
  { id: 'rent-public-housing-3', name: '公屋租單', type: 'RENT', value: 1, color: 'PUBLIC_HOUSING' },
  { id: 'rent-old-tong-lau', name: '唐樓租單', type: 'RENT', value: 1, color: 'OLD_TONG_LAU' },
  { id: 'rent-old-tong-lau-2', name: '唐樓租單', type: 'RENT', value: 1, color: 'OLD_TONG_LAU' },
  { id: 'rent-old-tong-lau-3', name: '唐樓租單', type: 'RENT', value: 1, color: 'OLD_TONG_LAU' },
  { id: 'rent-estate', name: '屋苑租單', type: 'RENT', value: 1, color: 'ESTATE' },
  { id: 'rent-estate-2', name: '屋苑租單', type: 'RENT', value: 1, color: 'ESTATE' },
  { id: 'rent-estate-3', name: '屋苑租單', type: 'RENT', value: 1, color: 'ESTATE' },
  { id: 'rent-commercial-luxury', name: '豪宅租單', type: 'RENT', value: 1, color: 'COMMERCIAL_LUXURY' },
  { id: 'rent-commercial-luxury-2', name: '豪宅租單', type: 'RENT', value: 1, color: 'COMMERCIAL_LUXURY' },
  { id: 'rent-commercial-luxury-3', name: '豪宅租單', type: 'RENT', value: 1, color: 'COMMERCIAL_LUXURY' },
  { id: 'rent-transport', name: '交通租單', type: 'RENT', value: 1, color: 'TRANSPORT' },
  { id: 'rent-transport-2', name: '交通租單', type: 'RENT', value: 1, color: 'TRANSPORT' },
  { id: 'rent-transport-3', name: '交通租單', type: 'RENT', value: 1, color: 'TRANSPORT' },
];

// Plain cash padding for the deck — CardType.MONEY existed from Phase 1 but had zero concrete
// cards until now. Denominations/counts mirror real Monopoly Deal's 20 money cards closely.
export const MONEY_CARDS: Card[] = [
  { id: 'money-1m-a', name: '現金 $1M', type: 'MONEY', value: 1 },
  { id: 'money-1m-b', name: '現金 $1M', type: 'MONEY', value: 1 },
  { id: 'money-1m-c', name: '現金 $1M', type: 'MONEY', value: 1 },
  { id: 'money-1m-d', name: '現金 $1M', type: 'MONEY', value: 1 },
  { id: 'money-1m-e', name: '現金 $1M', type: 'MONEY', value: 1 },
  { id: 'money-1m-f', name: '現金 $1M', type: 'MONEY', value: 1 },
  { id: 'money-1m-g', name: '現金 $1M', type: 'MONEY', value: 1 },
  { id: 'money-2m-a', name: '現金 $2M', type: 'MONEY', value: 2 },
  { id: 'money-2m-b', name: '現金 $2M', type: 'MONEY', value: 2 },
  { id: 'money-2m-c', name: '現金 $2M', type: 'MONEY', value: 2 },
  { id: 'money-2m-d', name: '現金 $2M', type: 'MONEY', value: 2 },
  { id: 'money-2m-e', name: '現金 $2M', type: 'MONEY', value: 2 },
  { id: 'money-2m-f', name: '現金 $2M', type: 'MONEY', value: 2 },
  { id: 'money-3m-a', name: '現金 $3M', type: 'MONEY', value: 3 },
  { id: 'money-3m-b', name: '現金 $3M', type: 'MONEY', value: 3 },
  { id: 'money-3m-c', name: '現金 $3M', type: 'MONEY', value: 3 },
  { id: 'money-3m-d', name: '現金 $3M', type: 'MONEY', value: 3 },
  { id: 'money-4m-a', name: '現金 $4M', type: 'MONEY', value: 4 },
  { id: 'money-4m-b', name: '現金 $4M', type: 'MONEY', value: 4 },
  { id: 'money-4m-c', name: '現金 $4M', type: 'MONEY', value: 4 },
  { id: 'money-5m-a', name: '現金 $5M', type: 'MONEY', value: 5 },
  { id: 'money-5m-b', name: '現金 $5M', type: 'MONEY', value: 5 },
  { id: 'money-10m', name: '現金 $10M', type: 'MONEY', value: 10 },
];

export const CARDS: Card[] = [...PROPERTY_CARDS, ...ACTION_CARDS, ...RENT_CARDS, ...MONEY_CARDS];

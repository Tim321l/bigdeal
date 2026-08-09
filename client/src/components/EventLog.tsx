import type { GameEvent } from '../types';

function describeEvent(event: GameEvent, nameOf: (id: string) => string): string {
  switch (event.type) {
    case 'CARDS_DRAWN':
      return event.count === 0
        ? `${nameOf(event.playerId)} 想抽牌,但牌組同棄牌堆暫時都空咗(要等有人打牌先會有得抽)`
        : `${nameOf(event.playerId)} 抽咗 ${event.count} 張牌`;
    case 'MACRO_EVENT_TRIGGERED':
      return `📰 觸發事件:${event.event.name} — ${event.event.description}`;
    case 'MACRO_EVENT_EXPIRED':
      return '一個事件完結咗';
    case 'CARD_BANKED':
      return `${nameOf(event.playerId)} 存入銀行 $${event.amount}M`;
    case 'PROPERTY_BUILT':
      return `${nameOf(event.playerId)} 起咗樓`;
    case 'REACTION_REQUESTED':
      return `${nameOf(event.playerId)} 要回應「${event.card.name}」`;
    case 'REACTION_RESOLVED':
      return `${nameOf(event.playerId)} ${
        event.response === 'JUST_SAY_NO' ? '打出封區!' : event.response === 'COUNTER' ? '打出炒家摸頂反擊!' : '接受咗'
      }`;
    case 'RENT_CHARGED':
      return event.amount === 0
        ? `${nameOf(event.toPlayerId)} 想同 ${nameOf(event.fromPlayerId)} 收租,但而家冇嘢收得到(可能因為《賣地流標》未集齊套暫停收租)`
        : `${nameOf(event.fromPlayerId)} 俾咗 $${event.amount}M 畀 ${nameOf(event.toPlayerId)}`;
    case 'RENT_MULTIPLIED':
      return `${nameOf(event.playerId)} 雙倍租金 x${event.multiplier}`;
    case 'PROPERTY_STOLEN':
      return `${nameOf(event.toPlayerId)} 由 ${nameOf(event.fromPlayerId)} 度搶咗一張物業`;
    case 'SET_STOLEN':
      return `${nameOf(event.toPlayerId)} 強拍咗 ${nameOf(event.fromPlayerId)} 一套物業`;
    case 'PROPERTY_SWAPPED':
      return `${nameOf(event.playerAId)} 同 ${nameOf(event.playerBId)} 交換咗物業`;
    case 'HAND_DISCARDED':
      return `${nameOf(event.playerId)} 棄咗 ${event.count} 張牌`;
    case 'HAND_CARD_STOLEN':
      return event.success
        ? `${nameOf(event.toPlayerId)} 打荷包,由 ${nameOf(event.fromPlayerId)} 度偷咗一張手牌`
        : `${nameOf(event.toPlayerId)} 想打荷包,但 ${nameOf(event.fromPlayerId)} 手牌係空嘅`;
    case 'PROPERTY_PROTECTED':
      return `${nameOf(event.playerId)} 用釘子戶保護咗一套物業`;
    case 'IMPROVEMENT_STRIPPED':
      return `${nameOf(event.toPlayerId)} 用圍標天價維修拆走咗 ${nameOf(event.fromPlayerId)} 嘅洋樓/酒店`;
    case 'PROPERTY_STIGMATIZED':
      return `${nameOf(event.toPlayerId)} 用凶宅傳聞逼 ${nameOf(event.fromPlayerId)} 棄咗一張物業`;
    case 'BANK_WITHDRAWN':
      return `${nameOf(event.playerId)} 用提款機壞咗,由銀行攞返 ${event.count} 張卡入手牌`;
    case 'BANK_RENT_LAUNDERED':
      return `${nameOf(event.playerId)} 洗黑錢,由銀行直接發動咗一張租單`;
    case 'BANK_CARD_SEIZED':
      return `${nameOf(event.toPlayerId)} 用接管清盤人,由 ${nameOf(event.fromPlayerId)} 銀行度攞走一張卡`;
    case 'CARD_BURIED':
      return `${nameOf(event.playerId)} 用逆按揭,將一張銀行卡放返落牌組底,補抽咗新手牌`;
    case 'PLAYER_ELIMINATED':
      return `💥 ${nameOf(event.playerId)} 破產出局!所有資產轉咗畀 ${nameOf(event.collectorId)}`;
    case 'CARD_GIFTED':
      return `🤝 ${nameOf(event.fromPlayerId)} 送咗一張牌畀隊友 ${nameOf(event.toPlayerId)}`;
    case 'AUCTION_STARTED':
      return `🔨 新一輪暗標拍賣:${event.cards.map((c) => c.name).join('、')}`;
    case 'BID_SUBMITTED':
      return `${nameOf(event.playerId)} 落咗標`;
    case 'AUCTION_RESOLVED': {
      const bidSummary = Object.entries(event.bids)
        .map(([playerId, amount]) => `${nameOf(playerId)} $${amount}M`)
        .join('、');
      return `🔨 ${nameOf(event.winnerId)} 以 $${event.winningBid}M 得標!(${bidSummary})`;
    }
    case 'RAID_FAILED':
      return '👹 回合用晒,全枱未達標 — 金融風暴獲勝,大家一齊輸咗';
    case 'DICE_ROLLED':
      return `🎲 ${nameOf(event.playerId)} 擲咗 ${event.roll} 點,由 ${event.fromPosition} 行到 ${event.toPosition}`;
    case 'PASSED_GO':
      return `🏁 ${nameOf(event.playerId)} 行過龍(起點),攞咗 $${event.amount}M`;
    case 'TILE_PURCHASED':
      return `🏠 ${nameOf(event.playerId)} 用 $${event.price}M 買起咗第 ${event.tileIndex} 格地皮`;
    case 'TILE_DECLINED':
      return `${nameOf(event.playerId)} 唔買第 ${event.tileIndex} 格地皮`;
    case 'TRANSIT_TELEPORTED':
      return `🚆 ${nameOf(event.playerId)} 搭去咗第 ${event.toPosition} 格交通基建`;
    case 'TURN_ENDED':
      return `${nameOf(event.playerId)} 完咗回合`;
    case 'GAME_WON':
      return `🏆 ${nameOf(event.playerId)} 贏咗遊戲!`;
    case 'INVALID_ACTION':
      return `⚠️ ${event.reason}`;
  }
}

export function EventLog({ events, nameOf }: { events: GameEvent[]; nameOf: (id: string) => string }) {
  if (events.length === 0) return null;
  const recent = [...events].reverse().slice(0, 20);

  return (
    <div className="event-log">
      <h4>動態</h4>
      <ul>
        {recent.map((event, index) => (
          <li key={index}>{describeEvent(event, nameOf)}</li>
        ))}
      </ul>
    </div>
  );
}

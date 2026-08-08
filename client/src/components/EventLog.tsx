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
      return `${nameOf(event.playerId)} ${event.response === 'JUST_SAY_NO' ? '打出封區!' : '接受咗'}`;
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

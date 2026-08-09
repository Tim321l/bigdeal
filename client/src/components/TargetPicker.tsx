import { useState } from 'react';
import { COMPLETE_SET_SIZE, PROPERTY_COLORS } from '../../../src/data/constants';
import { COLOR_LABELS } from '../labels';
import type { Card, PlayCardTarget, SanitizedGameState } from '../types';
import { CardView } from './CardView';

interface TargetPickerProps {
  card: Card;
  game: SanitizedGameState;
  myGamePlayerId: string;
  onConfirm: (target: PlayCardTarget) => void;
  onCancel: () => void;
}

function PickerShell({
  title,
  children,
  onBack,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="overlay">
      <div className="modal">
        <h3>{title}</h3>
        <div className="modal__body">{children}</div>
        <div className="modal__footer">
          {onBack && (
            <button type="button" className="btn btn--ghost" onClick={onBack}>
              返回
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

/** Walks the player through picking an opponent, then whatever that action card needs from them. */
export function TargetPicker({ card, game, myGamePlayerId, onConfirm, onCancel }: TargetPickerProps) {
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [opponentCardId, setOpponentCardId] = useState<string | null>(null);
  const [reorgCardId, setReorgCardId] = useState<string | null>(null);
  const [launderCardId, setLaunderCardId] = useState<string | null>(null);
  const [atmSelected, setAtmSelected] = useState<Set<string>>(new Set());

  const me = game.players.find((p) => p.id === myGamePlayerId) ?? null;
  // SYNDICATE: your own teammate is never a legal target for aggressive cards (server-enforced
  // too) — 送畀隊友 in PlayerHand is the only sanctioned way to hand them something.
  const opponents = game.players.filter(
    (p) => p.id !== myGamePlayerId && !(game.mode === 'SYNDICATE' && me?.teamId !== undefined && p.teamId === me.teamId),
  );
  const opponent = opponents.find((p) => p.id === opponentId) ?? null;

  // Wild RENT cards: pick a color from the card's eligible colors that you actually own
  // property of; fully-wild (rentScope 'SINGLE') ones also need one opponent chosen first.
  if (card.type === 'RENT' && card.wildColors) {
    const myEligibleColors = card.wildColors.filter((color) => {
      const propertyCount = (me?.field[color] ?? []).filter((c) => c.type === 'PROPERTY').length;
      return propertyCount > 0;
    });

    const colorPicker = (targetPlayerId: string, onBack?: () => void) => (
      <PickerShell title={`使用「${card.name}」— 揀收邊種顏色嘅租`} {...(onBack ? { onBack } : {})} onCancel={onCancel}>
        {myEligibleColors.length === 0 ? (
          <p>你自己未有呢張卡涵蓋嘅任何顏色物業。</p>
        ) : (
          <div className="modal__list">
            {myEligibleColors.map((color) => (
              <button
                key={color}
                type="button"
                className="btn btn--block"
                onClick={() => onConfirm({ playerId: targetPlayerId, color })}
              >
                {COLOR_LABELS[color]}
              </button>
            ))}
          </div>
        )}
      </PickerShell>
    );

    if (card.rentScope === 'SINGLE') {
      if (!opponent) {
        return (
          <PickerShell title={`使用「${card.name}」— 揀一位對手`} onCancel={onCancel}>
            <div className="modal__list">
              {opponents.map((p) => (
                <button key={p.id} type="button" className="btn btn--block" onClick={() => setOpponentId(p.id)}>
                  {p.name}
                </button>
              ))}
            </div>
          </PickerShell>
        );
      }
      return colorPicker(opponent.id, () => setOpponentId(null));
    }

    return colorPicker(myGamePlayerId);
  }

  // 洋樓/酒店 go on one of YOUR OWN sets — no opponent involved at all.
  if (card.actionType === 'HOUSE' || card.actionType === 'HOTEL') {
    const eligibleColors = PROPERTY_COLORS.filter((color) => {
      if (color === 'TRANSPORT') return false;
      const set = me?.field[color] ?? [];
      const propertyCount = set.filter((c) => c.type === 'PROPERTY').length;
      const hasHouse = set.some((c) => c.actionType === 'HOUSE');
      const hasHotel = set.some((c) => c.actionType === 'HOTEL');
      return card.actionType === 'HOUSE' ? propertyCount >= COMPLETE_SET_SIZE && !hasHouse : hasHouse && !hasHotel;
    });

    return (
      <PickerShell title={`使用「${card.name}」— 揀你自己嘅物業套`} onCancel={onCancel}>
        {eligibleColors.length === 0 ? (
          <p>而家未有合資格嘅物業套。</p>
        ) : (
          <div className="modal__list">
            {eligibleColors.map((color) => (
              <button
                key={color}
                type="button"
                className="btn btn--block"
                onClick={() => onConfirm({ playerId: myGamePlayerId, color })}
              >
                {COLOR_LABELS[color]}
              </button>
            ))}
          </div>
        )}
      </PickerShell>
    );
  }

  // 釘子戶 also goes on YOUR OWN colors — any color you already own a property in, not yet
  // protected. Unlike House/Hotel it doesn't need a completed set, and it does work on
  // TRANSPORT (the "no improvements" rule only applies to House/Hotel).
  if (card.actionType === 'NAIL_HOUSE') {
    const eligibleColors = PROPERTY_COLORS.filter((color) => {
      const set = me?.field[color] ?? [];
      const ownsProperty = set.some((c) => c.type === 'PROPERTY');
      const alreadyProtected = set.some((c) => c.actionType === 'NAIL_HOUSE');
      return ownsProperty && !alreadyProtected;
    });

    return (
      <PickerShell title={`使用「${card.name}」— 揀你自己嘅物業套`} onCancel={onCancel}>
        {eligibleColors.length === 0 ? (
          <p>而家未有合資格嘅物業套(要自己有嗰種顏色,亦都未受保護)。</p>
        ) : (
          <div className="modal__list">
            {eligibleColors.map((color) => (
              <button
                key={color}
                type="button"
                className="btn btn--block"
                onClick={() => onConfirm({ playerId: myGamePlayerId, color })}
              >
                {COLOR_LABELS[color]}
              </button>
            ))}
          </div>
        )}
      </PickerShell>
    );
  }

  // 物業重組: pick a bank card, then (for a colorless House/Hotel) which eligible set to attach
  // it to — a plain property confirms straight away since it already carries its own color.
  if (card.actionType === 'ASSET_REORG') {
    const bankOptions = (me?.bank ?? []).filter((c) => c.type === 'PROPERTY' || c.actionType === 'HOUSE' || c.actionType === 'HOTEL');
    const chosen = bankOptions.find((c) => c.id === reorgCardId);

    if (!chosen) {
      return (
        <PickerShell title={`使用「${card.name}」— 揀銀行入面邊張`} onCancel={onCancel}>
          {bankOptions.length === 0 ? (
            <p>你銀行入面而家冇物業/洋樓/酒店可以攞返出嚟。</p>
          ) : (
            <div className="modal__list modal__list--cards">
              {bankOptions.map((c) => (
                <CardView
                  key={c.id}
                  card={c}
                  onClick={() =>
                    c.type === 'PROPERTY' && c.color
                      ? onConfirm({ playerId: myGamePlayerId, cardId: c.id, color: c.color })
                      : setReorgCardId(c.id)
                  }
                />
              ))}
            </div>
          )}
        </PickerShell>
      );
    }

    const eligibleColors = PROPERTY_COLORS.filter((color) => {
      if (color === 'TRANSPORT') return false;
      const set = me?.field[color] ?? [];
      const propertyCount = set.filter((c) => c.type === 'PROPERTY').length;
      const hasHouse = set.some((c) => c.actionType === 'HOUSE');
      const hasHotel = set.some((c) => c.actionType === 'HOTEL');
      return chosen.actionType === 'HOUSE' ? propertyCount >= COMPLETE_SET_SIZE && !hasHouse : hasHouse && !hasHotel;
    });

    return (
      <PickerShell title={`使用「${card.name}」— 揀邊套物業`} onBack={() => setReorgCardId(null)} onCancel={onCancel}>
        {eligibleColors.length === 0 ? (
          <p>而家未有合資格嘅物業套。</p>
        ) : (
          <div className="modal__list">
            {eligibleColors.map((color) => (
              <button
                key={color}
                type="button"
                className="btn btn--block"
                onClick={() => onConfirm({ playerId: myGamePlayerId, cardId: chosen.id, color })}
              >
                {COLOR_LABELS[color]}
              </button>
            ))}
          </div>
        )}
      </PickerShell>
    );
  }

  // 提款機壞咗: multi-select up to 2 non-cash bank cards, then confirm.
  if (card.actionType === 'ATM_WITHDRAWAL') {
    const bankOptions = (me?.bank ?? []).filter((c) => c.type !== 'MONEY');
    const toggle = (id: string): void => {
      setAtmSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else if (next.size < 2) next.add(id);
        return next;
      });
    };
    return (
      <PickerShell title={`使用「${card.name}」— 揀最多 2 張攞返出嚟`} onCancel={onCancel}>
        {bankOptions.length === 0 ? (
          <p>你銀行入面而家冇非現金卡可以攞返出嚟。</p>
        ) : (
          <>
            <div className="modal__list modal__list--cards">
              {bankOptions.map((c) => (
                <CardView key={c.id} card={c} selected={atmSelected.has(c.id)} onClick={() => toggle(c.id)} />
              ))}
            </div>
            <button
              type="button"
              className="btn btn--primary"
              disabled={atmSelected.size === 0}
              onClick={() => onConfirm({ playerId: myGamePlayerId, cardIds: [...atmSelected] })}
            >
              確認攞返 {atmSelected.size} 張
            </button>
          </>
        )}
      </PickerShell>
    );
  }

  // 洗黑錢: pick a bank rent card, then a color (and, for the fully-wild card, an opponent too).
  if (card.actionType === 'MONEY_LAUNDERING') {
    const rentOptions = (me?.bank ?? []).filter((c) => c.type === 'RENT');
    const chosen = rentOptions.find((c) => c.id === launderCardId);

    if (!chosen) {
      return (
        <PickerShell title={`使用「${card.name}」— 揀銀行入面邊張租單`} onCancel={onCancel}>
          {rentOptions.length === 0 ? (
            <p>你銀行入面而家冇租單卡。</p>
          ) : (
            <div className="modal__list modal__list--cards">
              {rentOptions.map((c) => (
                <CardView
                  key={c.id}
                  card={c}
                  onClick={() => (c.color ? onConfirm({ playerId: myGamePlayerId, cardId: c.id }) : setLaunderCardId(c.id))}
                />
              ))}
            </div>
          )}
        </PickerShell>
      );
    }

    const myEligibleColors = (chosen.wildColors ?? []).filter((color) => (me?.field[color] ?? []).some((c) => c.type === 'PROPERTY'));

    if (chosen.rentScope === 'SINGLE') {
      if (!opponent) {
        return (
          <PickerShell title={`使用「${card.name}」— 揀一位對手`} onBack={() => setLaunderCardId(null)} onCancel={onCancel}>
            <div className="modal__list">
              {opponents.map((p) => (
                <button key={p.id} type="button" className="btn btn--block" onClick={() => setOpponentId(p.id)}>
                  {p.name}
                </button>
              ))}
            </div>
          </PickerShell>
        );
      }
      return (
        <PickerShell title={`使用「${card.name}」— 揀收邊種顏色嘅租`} onBack={() => setOpponentId(null)} onCancel={onCancel}>
          {myEligibleColors.length === 0 ? (
            <p>你自己未有呢張租單涵蓋嘅任何顏色物業。</p>
          ) : (
            <div className="modal__list">
              {myEligibleColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="btn btn--block"
                  onClick={() => onConfirm({ playerId: opponent.id, cardId: chosen.id, color })}
                >
                  {COLOR_LABELS[color]}
                </button>
              ))}
            </div>
          )}
        </PickerShell>
      );
    }

    return (
      <PickerShell title={`使用「${card.name}」— 揀收邊種顏色嘅租`} onBack={() => setLaunderCardId(null)} onCancel={onCancel}>
        {myEligibleColors.length === 0 ? (
          <p>你自己未有呢張租單涵蓋嘅任何顏色物業。</p>
        ) : (
          <div className="modal__list">
            {myEligibleColors.map((color) => (
              <button
                key={color}
                type="button"
                className="btn btn--block"
                onClick={() => onConfirm({ playerId: myGamePlayerId, cardId: chosen.id, color })}
              >
                {COLOR_LABELS[color]}
              </button>
            ))}
          </div>
        )}
      </PickerShell>
    );
  }

  // 逆按揭: pick one non-cash bank card to bury.
  if (card.actionType === 'REVERSE_MORTGAGE') {
    const bankOptions = (me?.bank ?? []).filter((c) => c.type !== 'MONEY');
    return (
      <PickerShell title={`使用「${card.name}」— 揀銀行入面邊張放返落牌組`} onCancel={onCancel}>
        {bankOptions.length === 0 ? (
          <p>你銀行入面而家冇非現金卡。</p>
        ) : (
          <div className="modal__list modal__list--cards">
            {bankOptions.map((c) => (
              <CardView key={c.id} card={c} onClick={() => onConfirm({ playerId: myGamePlayerId, cardId: c.id })} />
            ))}
          </div>
        )}
      </PickerShell>
    );
  }

  if (!opponent) {
    return (
      <PickerShell title={`使用「${card.name}」`} onCancel={onCancel}>
        <p>揀一位對手:</p>
        <div className="modal__list">
          {opponents.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn btn--block"
              onClick={() =>
                card.actionType === 'DEBT_COLLECTOR' || card.actionType === 'PICKPOCKET'
                  ? onConfirm({ playerId: p.id })
                  : setOpponentId(p.id)
              }
            >
              {p.name}
            </button>
          ))}
        </div>
      </PickerShell>
    );
  }

  const isProtected = (color: (typeof PROPERTY_COLORS)[number]): boolean =>
    opponent.field[color].some((c) => c.actionType === 'NAIL_HOUSE');
  // NOT field[color].length — 釘子戶 can sit on an incomplete set, so the raw array length
  // alone doesn't mean "3 properties" (mirrors the same fix in stateManager.ts).
  const opponentPropertyCount = (color: (typeof PROPERTY_COLORS)[number]): number =>
    opponent.field[color].filter((c) => c.type === 'PROPERTY').length;

  if (card.actionType === 'DEAL_BREAKER') {
    const completeColors = PROPERTY_COLORS.filter((color) => opponentPropertyCount(color) >= COMPLETE_SET_SIZE && !isProtected(color));
    return (
      <PickerShell title={`對 ${opponent.name} 使用「${card.name}」`} onBack={() => setOpponentId(null)} onCancel={onCancel}>
        {completeColors.length === 0 ? (
          <p>{opponent.name} 冇未受保護嘅集齊物業套,揀第位啦。</p>
        ) : (
          <div className="modal__list">
            {completeColors.map((color) => (
              <button
                key={color}
                type="button"
                className="btn btn--block"
                onClick={() => onConfirm({ playerId: opponent.id, color })}
              >
                {COLOR_LABELS[color]}(已集齊)
              </button>
            ))}
          </div>
        )}
      </PickerShell>
    );
  }

  if (card.actionType === 'RENOVATION_SCAM') {
    const improvedColors = PROPERTY_COLORS.filter((color) => opponent.field[color].some((c) => c.actionType === 'HOUSE' || c.actionType === 'HOTEL'));
    return (
      <PickerShell title={`對 ${opponent.name} 使用「${card.name}」`} onBack={() => setOpponentId(null)} onCancel={onCancel}>
        {improvedColors.length === 0 ? (
          <p>{opponent.name} 冇任何一套裝咗洋樓或者酒店,揀第位啦。</p>
        ) : (
          <div className="modal__list">
            {improvedColors.map((color) => (
              <button
                key={color}
                type="button"
                className="btn btn--block"
                onClick={() => onConfirm({ playerId: opponent.id, color })}
              >
                {COLOR_LABELS[color]}
              </button>
            ))}
          </div>
        )}
      </PickerShell>
    );
  }

  if (card.actionType === 'HAUNTED_RUMOR') {
    const targetable: Card[] = PROPERTY_COLORS.flatMap((color) =>
      isProtected(color) ? [] : opponent.field[color].filter((c) => c.type === 'PROPERTY'),
    );
    return (
      <PickerShell title={`對 ${opponent.name} 使用「${card.name}」`} onBack={() => setOpponentId(null)} onCancel={onCancel}>
        {targetable.length === 0 ? (
          <p>{opponent.name} 冇未受保護嘅物業,揀第位啦。</p>
        ) : (
          <div className="modal__list modal__list--cards">
            {targetable.map((c) => (
              <CardView key={c.id} card={c} onClick={() => onConfirm({ playerId: opponent.id, cardId: c.id })} />
            ))}
          </div>
        )}
      </PickerShell>
    );
  }

  if (card.actionType === 'LIQUIDATOR_TAKEOVER') {
    // Bank contents are always public, so there's no hidden info to worry about here.
    const seizable = opponent.bank.filter((c) => c.type !== 'MONEY');
    return (
      <PickerShell title={`對 ${opponent.name} 使用「${card.name}」`} onBack={() => setOpponentId(null)} onCancel={onCancel}>
        {seizable.length === 0 ? (
          <p>{opponent.name} 銀行入面冇非現金卡,揀第位啦。</p>
        ) : (
          <div className="modal__list modal__list--cards">
            {seizable.map((c) => (
              <CardView key={c.id} card={c} onClick={() => onConfirm({ playerId: opponent.id, cardId: c.id })} />
            ))}
          </div>
        )}
      </PickerShell>
    );
  }

  const stealable: Card[] = PROPERTY_COLORS.flatMap((color) =>
    opponentPropertyCount(color) < COMPLETE_SET_SIZE && !isProtected(color) ? opponent.field[color] : [],
  );

  if (card.actionType === 'SLY_DEAL') {
    return (
      <PickerShell title={`對 ${opponent.name} 使用「${card.name}」`} onBack={() => setOpponentId(null)} onCancel={onCancel}>
        {stealable.length === 0 ? (
          <p>{opponent.name} 冇未集齊套嘅物業,揀第位啦。</p>
        ) : (
          <div className="modal__list modal__list--cards">
            {stealable.map((c) => (
              <CardView key={c.id} card={c} onClick={() => onConfirm({ playerId: opponent.id, cardId: c.id })} />
            ))}
          </div>
        )}
      </PickerShell>
    );
  }

  // FORCED_DEAL: pick their property first, then one of mine to offer in exchange.
  if (!opponentCardId) {
    return (
      <PickerShell
        title={`對 ${opponent.name} 使用「${card.name}」— 揀佢嘅物業`}
        onBack={() => setOpponentId(null)}
        onCancel={onCancel}
      >
        {stealable.length === 0 ? (
          <p>{opponent.name} 冇未集齊套嘅物業,揀第位啦。</p>
        ) : (
          <div className="modal__list modal__list--cards">
            {stealable.map((c) => (
              <CardView key={c.id} card={c} onClick={() => setOpponentCardId(c.id)} />
            ))}
          </div>
        )}
      </PickerShell>
    );
  }

  const myOfferable: Card[] = me ? PROPERTY_COLORS.flatMap((color) => me.field[color]) : [];

  return (
    <PickerShell title="揀你出讓嘅物業" onBack={() => setOpponentCardId(null)} onCancel={onCancel}>
      {myOfferable.length === 0 ? (
        <p>你未有物業可以交換。</p>
      ) : (
        <div className="modal__list modal__list--cards">
          {myOfferable.map((c) => (
            <CardView
              key={c.id}
              card={c}
              onClick={() => onConfirm({ playerId: opponent.id, cardId: opponentCardId, offeredCardId: c.id })}
            />
          ))}
        </div>
      )}
    </PickerShell>
  );
}

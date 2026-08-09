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

  const me = game.players.find((p) => p.id === myGamePlayerId) ?? null;
  const opponents = game.players.filter((p) => p.id !== myGamePlayerId);
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

  if (card.actionType === 'DEAL_BREAKER') {
    const completeColors = PROPERTY_COLORS.filter((color) => opponent.field[color].length >= COMPLETE_SET_SIZE && !isProtected(color));
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

  const stealable: Card[] = PROPERTY_COLORS.flatMap((color) =>
    opponent.field[color].length < COMPLETE_SET_SIZE && !isProtected(color) ? opponent.field[color] : [],
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

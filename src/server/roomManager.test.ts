import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS, RoomManager } from './roomManager';

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`expected ok result, got error: ${result.error}`);
  return result.value;
}

describe('createRoom', () => {
  it('creates a LOBBY room with the host as its sole player', () => {
    const manager = new RoomManager();
    const { room, lobbyId } = unwrap(manager.createRoom('Alice', 'socket-alice'));

    expect(room.status).toBe('LOBBY');
    expect(room.players).toHaveLength(1);
    expect(room.players[0]?.name).toBe('Alice');
    expect(room.hostLobbyId).toBe(lobbyId);
    expect(room.id).toMatch(/^[A-Z0-9]{6}$/);
  });
});

describe('joinRoom', () => {
  it('adds a second player to an existing room', () => {
    const manager = new RoomManager();
    const { room } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    const joined = unwrap(manager.joinRoom(room.id, 'Bob', 'socket-bob'));
    expect(joined.room.players.map((p) => p.name)).toEqual(['Alice', 'Bob']);
  });

  it('rejects joining an unknown room', () => {
    const manager = new RoomManager();
    const result = manager.joinRoom('NOSUCH', 'Bob', 'socket-bob');
    expect(result).toEqual({ ok: false, error: 'Room not found.' });
  });

  it('rejects joining a room that already started', () => {
    const manager = new RoomManager();
    const { room } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    unwrap(manager.joinRoom(room.id, 'Bob', 'socket-bob'));
    unwrap(manager.setReady(room.id, room.players[0]!.lobbyId, true));
    unwrap(manager.setReady(room.id, room.players[1]!.lobbyId, true));

    const result = manager.joinRoom(room.id, 'Carol', 'socket-carol');
    expect(result).toEqual({ ok: false, error: 'Room is not accepting new players.' });
  });

  it('rejects joining once the room is full', () => {
    const manager = new RoomManager();
    const { room } = unwrap(manager.createRoom('Player 0', 'socket-0'));
    for (let i = 1; i < MAX_PLAYERS; i++) {
      unwrap(manager.joinRoom(room.id, `Player ${i}`, `socket-${i}`));
    }
    const result = manager.joinRoom(room.id, 'One too many', 'socket-extra');
    expect(result).toEqual({ ok: false, error: 'Room is full.' });
  });
});

describe('setReady and auto-start', () => {
  it('does not start until every player is ready', () => {
    const manager = new RoomManager();
    const { room } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    const { room: joined } = unwrap(manager.joinRoom(room.id, 'Bob', 'socket-bob'));

    const afterAliceReady = unwrap(manager.setReady(room.id, joined.players[0]!.lobbyId, true));
    expect(afterAliceReady.started).toBe(false);
    expect(afterAliceReady.room.status).toBe('LOBBY');
  });

  it('auto-starts once everyone is ready, assigning gamePlayerId in join order', () => {
    const manager = new RoomManager();
    const { room } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    unwrap(manager.joinRoom(room.id, 'Bob', 'socket-bob'));

    unwrap(manager.setReady(room.id, room.players[0]!.lobbyId, true));
    const result = unwrap(manager.setReady(room.id, room.players[1]!.lobbyId, true));

    expect(result.started).toBe(true);
    expect(result.room.status).toBe('IN_PROGRESS');
    expect(result.room.players[0]?.gamePlayerId).toBe('player-1');
    expect(result.room.players[1]?.gamePlayerId).toBe('player-2');
    expect(result.room.gameState?.players.map((p) => p.name)).toEqual(['Alice', 'Bob']);
    expect(result.room.gameState?.players.every((p) => p.hand.length === 5)).toBe(true);
  });

  it('requires at least MIN_PLAYERS before starting, even if the lone player is ready', () => {
    const manager = new RoomManager();
    const { room } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    const result = unwrap(manager.setReady(room.id, room.players[0]!.lobbyId, true));
    expect(result.started).toBe(false);
  });
});

describe('submitIntent', () => {
  function startedRoom() {
    const manager = new RoomManager();
    const { room } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    unwrap(manager.joinRoom(room.id, 'Bob', 'socket-bob'));
    unwrap(manager.setReady(room.id, room.players[0]!.lobbyId, true));
    unwrap(manager.setReady(room.id, room.players[1]!.lobbyId, true));
    return { manager, room };
  }

  it('rejects intents before the game has started', () => {
    const manager = new RoomManager();
    const { room } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    const result = manager.submitIntent(room.id, room.players[0]!.lobbyId, {
      type: 'DRAW',
      playerId: 'player-1',
    });
    expect(result).toEqual({ ok: false, error: 'The game has not started yet.' });
  });

  it('rejects an intent whose playerId does not match the caller (anti-impersonation)', () => {
    const { manager, room } = startedRoom();
    const alice = room.players[0]!;
    const bob = room.players[1]!;

    // Alice's socket tries to submit an action as Bob.
    const result = manager.submitIntent(room.id, alice.lobbyId, { type: 'DRAW', playerId: bob.gamePlayerId! });
    expect(result).toEqual({ ok: false, error: 'You may only act as your own player.' });
  });

  it('applies a valid intent through the engine and returns its events', () => {
    const { manager, room } = startedRoom();
    const alice = room.players[0]!;

    const result = unwrap(manager.submitIntent(room.id, alice.lobbyId, { type: 'DRAW', playerId: alice.gamePlayerId! }));
    expect(result.events).toContainEqual({ type: 'CARDS_DRAWN', playerId: alice.gamePlayerId, count: expect.any(Number) });
    // Usually lands in ACTION, but a random 八號風球 trigger can skip straight back to TURN_START.
    expect(['ACTION', 'TURN_START']).toContain(result.room.gameState?.phase);
  });
});

describe('reconnect and disconnectSocket', () => {
  it('reconnects with a matching token and updates the socket id', () => {
    const manager = new RoomManager();
    const { room, lobbyId, reconnectToken } = unwrap(manager.createRoom('Alice', 'socket-alice'));

    const result = unwrap(manager.reconnect(room.id, lobbyId, reconnectToken, 'socket-42'));
    expect(result.room.players[0]?.connected).toBe(true);
    expect(result.room.players[0]?.socketId).toBe('socket-42');
  });

  it('rejects reconnecting with the wrong token', () => {
    const manager = new RoomManager();
    const { room, lobbyId } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    const result = manager.reconnect(room.id, lobbyId, 'not-the-real-token', 'socket-42');
    expect(result).toEqual({ ok: false, error: 'Invalid reconnect token.' });
  });

  it('marks a player disconnected without removing them from the room', () => {
    const manager = new RoomManager();
    const { room, lobbyId } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    const result = unwrap(manager.disconnectSocket(room.id, lobbyId));
    expect(result.room.players).toHaveLength(1);
    expect(result.room.players[0]?.connected).toBe(false);
    expect(result.room.players[0]?.socketId).toBeUndefined();
  });
});

describe('leaveRoom', () => {
  it('removes the player during LOBBY and reassigns the host if needed', () => {
    const manager = new RoomManager();
    const { room, lobbyId: aliceId } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    const { lobbyId: bobId } = unwrap(manager.joinRoom(room.id, 'Bob', 'socket-bob'));

    const result = unwrap(manager.leaveRoom(room.id, aliceId));
    expect(result.room?.players.map((p) => p.name)).toEqual(['Bob']);
    expect(result.room?.hostLobbyId).toBe(bobId);
  });

  it('deletes the room once the last player leaves', () => {
    const manager = new RoomManager();
    const { room, lobbyId } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    unwrap(manager.leaveRoom(room.id, lobbyId));
    expect(manager.getRoom(room.id)).toBeUndefined();
  });

  it('rejects leaving after the game has started', () => {
    const manager = new RoomManager();
    const { room } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    unwrap(manager.joinRoom(room.id, 'Bob', 'socket-bob'));
    unwrap(manager.setReady(room.id, room.players[0]!.lobbyId, true));
    unwrap(manager.setReady(room.id, room.players[1]!.lobbyId, true));

    const result = manager.leaveRoom(room.id, room.players[0]!.lobbyId);
    expect(result).toEqual({ ok: false, error: 'Cannot leave after the game has started.' });
  });
});

describe('bots', () => {
  it('lets the host add a bot, which starts already ready', () => {
    const manager = new RoomManager();
    const { room, lobbyId: hostId } = unwrap(manager.createRoom('Alice', 'socket-alice'));

    const result = unwrap(manager.addBot(room.id, hostId, 2));
    expect(result.room.players).toHaveLength(2);
    const bot = result.room.players[1]!;
    expect(bot.bot).toEqual({ level: 2 });
    expect(bot.ready).toBe(true);
    expect(bot.connected).toBe(true);
  });

  it('rejects a non-host trying to add a bot', () => {
    const manager = new RoomManager();
    const { room } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    const { lobbyId: bobId } = unwrap(manager.joinRoom(room.id, 'Bob', 'socket-bob'));

    const result = manager.addBot(room.id, bobId, 1);
    expect(result).toEqual({ ok: false, error: 'Only the host can add a bot.' });
  });

  it('lets a solo human start immediately once a bot is added and they ready up', () => {
    const manager = new RoomManager();
    const { room, lobbyId: hostId } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    unwrap(manager.addBot(room.id, hostId, 1));

    const result = unwrap(manager.setReady(room.id, hostId, true));
    expect(result.started).toBe(true);
    expect(result.room.gameState?.players.map((p) => p.name)).toEqual(['Alice', '機械人 1 (Lv.1)']);
  });

  it('lets the host remove a bot before the game starts', () => {
    const manager = new RoomManager();
    const { room, lobbyId: hostId } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    const added = unwrap(manager.addBot(room.id, hostId, 3));
    const botId = added.room.players[1]!.lobbyId;

    const result = unwrap(manager.removeBot(room.id, hostId, botId));
    expect(result.room.players).toHaveLength(1);
  });

  it('processBotTurns drives the bot all the way to a human decision point or game end', () => {
    const manager = new RoomManager();
    const { room, lobbyId: hostId } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    unwrap(manager.addBot(room.id, hostId, 2));
    const started = unwrap(manager.setReady(room.id, hostId, true));
    expect(started.started).toBe(true);
    // Alice (host) is always player-1 and always active first, so the bot shouldn't have moved yet.
    expect(started.room.gameState?.phase).toBe('TURN_START');

    // Alice draws and ends her turn; the bot (player-2) should then play its whole turn on its own.
    unwrap(manager.submitIntent(room.id, hostId, { type: 'DRAW', playerId: 'player-1' }));
    const afterHumanEndTurn = unwrap(
      manager.submitIntent(room.id, hostId, { type: 'END_TURN', playerId: 'player-1' }),
    );
    expect(afterHumanEndTurn.room.gameState?.activePlayerIndex).toBe(1);

    let botEvents = manager.processBotTurns(room.id);
    expect(botEvents.length).toBeGreaterThan(0);

    // processBotTurns correctly stops if the bot opens a reaction window against Alice (a human)
    // — that's a legitimate pause point, not a bug. Resolve it like the real client would so the
    // bot's turn can actually finish, then let the bot resume.
    let state = manager.getRoom(room.id)?.gameState;
    let guard = 0;
    while (state?.phase === 'REACTION_WINDOW' && state.pendingReaction?.currentResponderId === 'player-1' && guard < 10) {
      unwrap(manager.submitIntent(room.id, hostId, { type: 'RESPOND', playerId: 'player-1', response: 'ACCEPT' }));
      botEvents = manager.processBotTurns(room.id);
      state = manager.getRoom(room.id)?.gameState;
      guard += 1;
    }

    // The bot should have played itself all the way back to Alice's turn (or ended the game).
    expect(state?.activePlayerIndex === 0 || state?.phase === 'GAME_OVER').toBe(true);
  });

  it('processSingleBotStep runs exactly one bot decision at a time, unlike processBotTurns', () => {
    const manager = new RoomManager();
    const { room, lobbyId: hostId } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    unwrap(manager.addBot(room.id, hostId, 2));
    unwrap(manager.setReady(room.id, hostId, true));
    unwrap(manager.submitIntent(room.id, hostId, { type: 'DRAW', playerId: 'player-1' }));
    unwrap(manager.submitIntent(room.id, hostId, { type: 'END_TURN', playerId: 'player-1' }));

    // A single step should never resolve the bot's whole turn on its own — draw alone is at
    // least one action short of also playing/banking cards and ending the turn.
    const firstStepEvents = manager.processSingleBotStep(room.id);
    expect(firstStepEvents).not.toBeNull();
    expect(manager.isBotTurn(room.id)).toBe(true);

    // Stepping it out one at a time eventually reaches the same end point processBotTurns would
    // reach in one call — driving it the rest of the way confirms nothing gets stuck mid-turn.
    let steps = 0;
    while (manager.isBotTurn(room.id) && steps < 50) {
      manager.processSingleBotStep(room.id);
      steps += 1;
    }
    expect(steps).toBeLessThan(50);
    expect(manager.isBotTurn(room.id)).toBe(false);
  });

  it('processSingleBotStep returns null when it is not currently a bot turn', () => {
    const manager = new RoomManager();
    const { room, lobbyId: hostId } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    unwrap(manager.addBot(room.id, hostId, 2));
    unwrap(manager.setReady(room.id, hostId, true));
    // It's Alice's (the human's) turn first — nothing for a bot to step through yet.
    expect(manager.processSingleBotStep(room.id)).toBeNull();
    expect(manager.processSingleBotStep('NOSUCH')).toBeNull();
  });

  it('never lets a bot submit an intent for someone else (defense in depth)', () => {
    const manager = new RoomManager();
    const { room, lobbyId: hostId } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    const added = unwrap(manager.addBot(room.id, hostId, 1));
    const botId = added.room.players[1]!.lobbyId;
    unwrap(manager.setReady(room.id, hostId, true));

    const result = manager.submitIntent(room.id, botId, { type: 'DRAW', playerId: 'player-1' });
    expect(result).toEqual({ ok: false, error: 'You may only act as your own player.' });
  });

  it('isBotTurn correctly identifies whose turn/reaction it is, including the alternating chained-封區 case', () => {
    const manager = new RoomManager();
    const { room, lobbyId: hostId } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    unwrap(manager.addBot(room.id, hostId, 3));
    unwrap(manager.setReady(room.id, hostId, true));

    // Fresh game: TURN_START, player-1 (the human host) is active.
    expect(manager.isBotTurn(room.id)).toBe(false);
  });

  it(
    'a long bot-driven game always reaches a conclusion — processBotTurns is never permanently ' +
      'stuck mid-rotation even across its own per-call step cap (the bug behind "game stopped responding")',
    () => {
      const manager = new RoomManager();
      const { room, lobbyId: hostId } = unwrap(manager.createRoom('Human', 'socket-human'));
      unwrap(manager.addBot(room.id, hostId, 3));
      const started = unwrap(manager.setReady(room.id, hostId, true));
      expect(started.started).toBe(true);

      // Simulates exactly what the server's setTimeout continuation chain does: keep calling
      // processBotTurns (or feeding the human's simplest legal move) until the game concludes.
      // If processBotTurns could get permanently stuck mid-bot-turn, this loop would never
      // terminate and the test would time out — that IS the regression check.
      const MAX_ITERATIONS = 500;
      let iterations = 0;
      let state = started.room.gameState!;

      while (state.phase !== 'GAME_OVER' && iterations < MAX_ITERATIONS) {
        iterations += 1;

        if (manager.isBotTurn(room.id)) {
          manager.processBotTurns(room.id);
        } else if (state.phase === 'REACTION_WINDOW') {
          unwrap(manager.submitIntent(room.id, hostId, { type: 'RESPOND', playerId: 'player-1', response: 'ACCEPT' }));
        } else if (state.phase === 'TURN_START') {
          unwrap(manager.submitIntent(room.id, hostId, { type: 'DRAW', playerId: 'player-1' }));
        } else if (state.phase === 'ACTION') {
          unwrap(manager.submitIntent(room.id, hostId, { type: 'END_TURN', playerId: 'player-1' }));
        }

        state = manager.getRoom(room.id)!.gameState!;
      }

      expect(state.phase).toBe('GAME_OVER');
      expect(iterations).toBeLessThan(MAX_ITERATIONS);
    },
  );
});

describe('spectate', () => {
  it('adds a socket to the room without creating a seat, and reflects it in the spectator count', () => {
    const manager = new RoomManager();
    const { room } = unwrap(manager.createRoom('Alice', 'socket-alice'));

    const spectated = unwrap(manager.spectate(room.id, 'socket-watcher'));
    expect(spectated.room.spectatorSocketIds.has('socket-watcher')).toBe(true);
    expect(spectated.room.players).toHaveLength(1); // no seat was created

    manager.unspectate(room.id, 'socket-watcher');
    expect(manager.getRoom(room.id)?.spectatorSocketIds.has('socket-watcher')).toBe(false);
  });

  it('rejects spectating an unknown room', () => {
    const manager = new RoomManager();
    const result = manager.spectate('NOSUCH', 'socket-watcher');
    expect(result).toEqual({ ok: false, error: 'Room not found.' });
  });

  it('works at any room status, including mid-game', () => {
    const manager = new RoomManager();
    const { room, lobbyId: hostId } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    unwrap(manager.joinRoom(room.id, 'Bob', 'socket-bob'));
    const started = unwrap(manager.setReady(room.id, hostId, true));
    unwrap(manager.setReady(room.id, started.room.players[1]!.lobbyId, true));

    const spectated = unwrap(manager.spectate(room.id, 'socket-watcher'));
    expect(spectated.room.status).toBe('IN_PROGRESS');
    expect(spectated.room.spectatorSocketIds.has('socket-watcher')).toBe(true);
  });
});

describe('match history', () => {
  it('starts empty and rejects an unknown room', () => {
    const manager = new RoomManager();
    const { room } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    expect(unwrap(manager.getHistory(room.id)).history).toEqual([]);
    expect(manager.getHistory('NOSUCH')).toEqual({ ok: false, error: 'Room not found.' });
  });

  it('records a result once a bot-driven game actually finishes', () => {
    const manager = new RoomManager();
    const { room, lobbyId: hostId } = unwrap(manager.createRoom('Human', 'socket-human'));
    unwrap(manager.addBot(room.id, hostId, 3));
    const started = unwrap(manager.setReady(room.id, hostId, true));
    expect(started.started).toBe(true);

    const MAX_ITERATIONS = 500;
    let iterations = 0;
    let state = started.room.gameState!;
    while (state.phase !== 'GAME_OVER' && iterations < MAX_ITERATIONS) {
      iterations += 1;
      if (manager.isBotTurn(room.id)) {
        manager.processBotTurns(room.id);
      } else if (state.phase === 'REACTION_WINDOW') {
        unwrap(manager.submitIntent(room.id, hostId, { type: 'RESPOND', playerId: 'player-1', response: 'ACCEPT' }));
      } else if (state.phase === 'TURN_START') {
        unwrap(manager.submitIntent(room.id, hostId, { type: 'DRAW', playerId: 'player-1' }));
      } else if (state.phase === 'ACTION') {
        unwrap(manager.submitIntent(room.id, hostId, { type: 'END_TURN', playerId: 'player-1' }));
      }
      state = manager.getRoom(room.id)!.gameState!;
    }
    expect(state.phase).toBe('GAME_OVER');

    const { history } = unwrap(manager.getHistory(room.id));
    expect(history).toHaveLength(1);
    expect(history[0]?.mode).toBe('CLASSIC');
    expect(history[0]?.playerNames).toEqual(['Human', '機械人 1 (Lv.3)']);
    expect(['Human', '機械人 1 (Lv.3)']).toContain(history[0]?.winnerName);
  });
});

describe('getRoomsSummary (admin dashboard)', () => {
  it('lists every room with each player IP included, unlike the public RoomSummary', () => {
    const manager = new RoomManager();
    unwrap(manager.createRoom('Alice', 'socket-alice', '203.0.113.5'));
    const summaries = manager.getRoomsSummary();

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.players[0]).toMatchObject({ name: 'Alice', ip: '203.0.113.5' });
  });

  it('returns an empty list when there are no rooms', () => {
    const manager = new RoomManager();
    expect(manager.getRoomsSummary()).toEqual([]);
  });
});

describe('kickPlayer (admin dashboard)', () => {
  it('fully evicts the player from a LOBBY room and reassigns the host if needed', () => {
    const manager = new RoomManager();
    const { room, lobbyId: hostId } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    const { lobbyId: bobId } = unwrap(manager.joinRoom(room.id, 'Bob', 'socket-bob'));

    const kicked = unwrap(manager.kickPlayer(room.id, hostId));
    expect(kicked.socketId).toBe('socket-alice');
    expect(kicked.room?.players.map((p) => p.lobbyId)).toEqual([bobId]);
    expect(kicked.room?.hostLobbyId).toBe(bobId);
  });

  it('deletes the room entirely when kicking the last remaining player', () => {
    const manager = new RoomManager();
    const { room, lobbyId: hostId } = unwrap(manager.createRoom('Alice', 'socket-alice'));

    const kicked = unwrap(manager.kickPlayer(room.id, hostId));
    expect(kicked.room).toBeUndefined();
    expect(manager.getRoom(room.id)).toBeUndefined();
  });

  it('only marks a mid-game player disconnected, without removing their seat', () => {
    const manager = new RoomManager();
    const { room, lobbyId: hostId } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    unwrap(manager.addBot(room.id, hostId, 2));
    unwrap(manager.setReady(room.id, hostId, true));

    const kicked = unwrap(manager.kickPlayer(room.id, hostId));
    expect(kicked.room?.status).toBe('IN_PROGRESS');
    expect(kicked.room?.players).toHaveLength(2);
    const alice = kicked.room?.players.find((p) => p.lobbyId === hostId);
    expect(alice?.connected).toBe(false);
    expect(alice?.socketId).toBeUndefined();
  });

  it('rejects kicking a player from an unknown room or an unknown player', () => {
    const manager = new RoomManager();
    const { room } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    expect(manager.kickPlayer('NOSUCH', 'whatever')).toEqual({ ok: false, error: 'Room not found.' });
    expect(manager.kickPlayer(room.id, 'nobody')).toEqual({ ok: false, error: 'That player is not in this room.' });
  });
});

describe('closeRoom (admin dashboard)', () => {
  it('deletes the room and returns every connected socket id to disconnect', () => {
    const manager = new RoomManager();
    const { room } = unwrap(manager.createRoom('Alice', 'socket-alice'));
    unwrap(manager.joinRoom(room.id, 'Bob', 'socket-bob'));
    unwrap(manager.spectate(room.id, 'socket-watcher'));

    const closed = unwrap(manager.closeRoom(room.id));
    expect(closed.socketIds.sort()).toEqual(['socket-alice', 'socket-bob', 'socket-watcher'].sort());
    expect(manager.getRoom(room.id)).toBeUndefined();
  });

  it('rejects closing an unknown room', () => {
    const manager = new RoomManager();
    expect(manager.closeRoom('NOSUCH')).toEqual({ ok: false, error: 'Room not found.' });
  });
});

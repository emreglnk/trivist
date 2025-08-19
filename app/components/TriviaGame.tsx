"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useGameState, Player } from "../hooks/useGameState";
import { useMovement } from "../hooks/useMovement";
import { useRealtimeGame } from "../hooks/useRealtimeGame";
import { useWallet } from "../hooks/useWallet";
import GameBoard, { BoardOverlay } from "./GameBoard";
import GameHUD from "./GameHUD";
import QuestionModal from "./QuestionModal";
import WalletButton from "./WalletButton";
import WalletBadge from "./WalletBadge";
import Image from "next/image";

interface QuestionPayload {
  category: string;
  question: string;
  options: string[];
  askedBy: string;
}

interface AnswerResultPayload {
  answeredBy: string;
  correct: boolean;
}

export default function TriviaGame() {
  const gameState = useGameState();
  const movement = useMovement();
  const realtimeGame = useRealtimeGame();
  const wallet = useWallet();
  const [overlay, setOverlay] = useState<BoardOverlay>(null);
  const [questionModal, setQuestionModal] = useState<{
    isOpen: boolean;
    category: string;
    readOnly?: boolean;
    injectedQuestion?: { q: string; opts: string[]; a: number } | null;
    askedBy?: string;
  }>({ isOpen: false, category: '', readOnly: false, injectedQuestion: null, askedBy: undefined });
  const [isBusy, setIsBusy] = useState(false);
  const [isMultiplayer] = useState(true);

  // Realtime minimal events via Socket.IO
  useEffect(() => {
    const socket = realtimeGame.socket as any;
    if (!socket) return;
    const onDiceRolled = () => setIsBusy(false);
    const onGameWon = ({ playerName }: { playerName: string }) => alert(`🎉 ${playerName} won the game!`);
    socket.on('diceRolled', onDiceRolled);
    socket.on('gameWon', onGameWon);
    return () => {
      socket.off('diceRolled', onDiceRolled);
      socket.off('gameWon', onGameWon);
    };
  }, [realtimeGame.socket]);

  // Open question modal for everyone; only current player can answer
  useEffect(() => {
    if (!realtimeGame.questionMeta) return;
    const askedBy = realtimeGame.questionMeta.askedBy as any;
    const isCurrentLocalPlayer = isMultiplayer && !!realtimeGame.assignedColor && askedBy === realtimeGame.assignedColor;
    const category = realtimeGame.questionMeta.category;
    if (category === 'roll') {
      // Special tile: roll again. No modal; same player keeps the turn.
      setTimeout(() => alert('🎲 Roll Again!'), 50);
      setQuestionModal({ isOpen: false, category: '', readOnly: false, injectedQuestion: null, askedBy });
      return;
    }
    setQuestionModal({
      isOpen: true,
      category,
      readOnly: isMultiplayer ? !isCurrentLocalPlayer : false,
      injectedQuestion: null,
      askedBy,
    });
  }, [realtimeGame.questionMeta, realtimeGame.assignedColor, isMultiplayer]);

  // Show selectable move options overlay when it's our turn
  useEffect(() => {
    if (!realtimeGame.moveOptions || !realtimeGame.gameState) { setOverlay(null); return; }
    if (!realtimeGame.assignedColor || realtimeGame.gameState.currentPlayer !== (realtimeGame.assignedColor as any)) { setOverlay(null); return; }
    // Build overlay targets from options' last step
    const targets = realtimeGame.moveOptions.map((opt) => {
      const last = (opt.path && opt.path.length > 0) ? opt.path[opt.path.length - 1] : null;
      if (!last) return null;
      if (last.state === 'ring') return { type: 'ring', pos: last.pos, optionId: opt.id };
      if (last.state === 'lane') return { type: 'lane', laneId: last.lane.id, depth: last.lane.depth, optionId: opt.id };
      return null;
    }).filter(Boolean) as any[];
    const ov: BoardOverlay = {
      type: 'select',
      targets: targets.map(t => ({ ...t })),
      onSelect: (t: any) => {
        const matched = targets.find(x => (x.type === t.type && (x.pos === t.pos || (x.laneId === t.laneId && x.depth === t.depth))));
        if (matched && matched.optionId) {
          realtimeGame.chooseMove(matched.optionId);
          setOverlay(null);
        }
      }
    } as any;
    setOverlay(ov);
  }, [realtimeGame.moveOptions, realtimeGame.gameState, realtimeGame.assignedColor]);

  // Join quick matchmaking when multiplayer mode is enabled
  useEffect(() => {
    if (isMultiplayer && realtimeGame.isConnected && !realtimeGame.gameState) {
      realtimeGame.joinRoom('auto', {
        address: wallet.address || '',
        signature: ''
      });
    }
  }, [isMultiplayer, realtimeGame.isConnected, realtimeGame.gameState, wallet.address]);

  const handleRollDice = useCallback(async () => {
    if (isBusy || questionModal.isOpen || overlay) return;
    setIsBusy(true);
    
    if (isMultiplayer && realtimeGame.isConnected) {
      // Only current player may roll
      if (!realtimeGame.gameState || !realtimeGame.assignedColor || realtimeGame.gameState.currentPlayer !== (realtimeGame.assignedColor as any)) {
        setIsBusy(false);
        alert('Not your turn');
        return;
      }
      console.log('Rolling dice for multiplayer...');
      realtimeGame.rollDice();
      // Don't set isBusy false here - it will be set in the diceRolled event handler
    } else {
      // Local single player game
      const diceValue = gameState.rollDice();
      const currentPlayer = gameState.players[gameState.currentPlayer];
      
      // Step-by-step movement with animation
      await performAnimatedMovement(currentPlayer, diceValue);
      setIsBusy(false);
    }
  }, [gameState, realtimeGame, isMultiplayer, isBusy, questionModal.isOpen, overlay]);

  const performAnimatedMovement = useCallback(async (player: Player, steps: number) => {
    let currentPlayer = { ...player };
    let remainingSteps = steps;
    let moved = false;
    let direction: 'cw' | 'ccw' | null = null;
    let directionChosen = false;

    console.log(`Starting movement: player=${currentPlayer.id}, steps=${steps}, state=${currentPlayer.state}`);

    // Handle special cases and choices first
    if (currentPlayer.state === 'center') {
      // Handle center exit choice
      const choice = await handleCenterExit(currentPlayer, steps);
      if (!choice) {
        alert('No available moves, turn passes to next player.');
        gameState.nextPlayer();
        return;
      }
      
      // Place player at lane exit point (counts as first step just like HTML)
      currentPlayer = choice.newPlayer;
      gameState.movePlayer(gameState.currentPlayer, { 
        state: 'lane', 
        lane: { id: choice.newPlayer.lane!.id, depth: 3, dir: 'out' } 
      });
      
      // Direction for movement
      direction = choice.direction || 'cw';
      directionChosen = !!choice.direction;
      
      // Consume one step for the placement from center -> lane depth 3
      remainingSteps = Math.max(0, remainingSteps - 1);
      moved = true; // placement counts as a step
      await new Promise(resolve => setTimeout(resolve, 250));
    } else if (currentPlayer.state === 'ring') {
      // Check if at entry point and can choose lane
      const laneChoice = await handleRingEntry(currentPlayer);
      if (laneChoice) {
        currentPlayer = laneChoice;
        gameState.movePlayer(gameState.currentPlayer, { 
          state: 'lane', 
          lane: laneChoice.lane 
        });
        remainingSteps--; // Consume one step for lane entry
      }
      
      // Check direction choice only if still on ring
      if (currentPlayer.state === 'ring') {
        const dirChoice = await handleDirectionChoice(currentPlayer, remainingSteps);
        if (dirChoice) {
          direction = dirChoice;
          directionChosen = true;
        }
      }
    }

    // Animated step-by-step movement
    let stepCount = 0;
    while (remainingSteps > 0 && stepCount < steps) { // Safety check
      console.log(`Step ${stepCount + 1}: remainingSteps=${remainingSteps}, currentState=${currentPlayer.state}`);
      
      const stepResult = movement.movePlayerStep(currentPlayer, gameState.players, direction || undefined);
      
      if (!stepResult.success) {
        console.log('Step failed, breaking');
        break;
      }
      
      const prevState = currentPlayer.state;
      currentPlayer = { ...currentPlayer, ...stepResult.newState };
      gameState.movePlayer(gameState.currentPlayer, stepResult.newState);
      moved = true;
      remainingSteps--;
      stepCount++;
      
      // Add animation delay between steps
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // If we just entered the ring from a lane during movement and have remaining steps,
      // prompt for direction choice (show highlight) unless already chosen
      if (prevState === 'lane' && currentPlayer.state === 'ring' && remainingSteps > 0 && !directionChosen) {
        const dirChoiceMid = await handleDirectionChoice(currentPlayer, remainingSteps);
        if (dirChoiceMid) {
          direction = dirChoiceMid;
          directionChosen = true;
        }
      }

      // Do not auto-enter lane mid-loop; lane choice is handled only at start of movement or when leaving center

      if (currentPlayer.state === 'center') {
        // console.log('Reached center, breaking');
        break;
      }
    }

    console.log(`Movement complete: moved=${moved}, finalState=${currentPlayer.state}, stepCount=${stepCount}`);

    if (!moved) {
      alert('Hareket edecek boş hücre yok, sıra sonrakine geçiyor.');
      gameState.nextPlayer();
      return;
    }

    // Handle landing actions
    await handleLandingAction(currentPlayer);
  }, [gameState, movement]);

  const handleCenterExit = useCallback(async (player: Player, steps: number) => {
    const laneEntries = [0, 6, 12, 18];
    const entryIndex = (laneId: number) => (laneEntries[laneId] - 1 + 24) % 24;
    const laneSteps = 3;
    const options: any[] = [];
    
    // For each lane, calculate where player would end up
    for (let laneId = 0; laneId < 4; laneId++) {
      const entryIdx = entryIndex(laneId);
      
      if (steps <= laneSteps) {
        // Player stops in lane at specific depth
        const depth = laneSteps - steps + 1;
        const disabled = movement.isLaneOccupied(laneId, depth, gameState.players);
        options.push({ kind: 'lane', laneId, depth, disabled });
      } else if (steps === laneSteps + 1) {
        // Player exits to ring entry point
        const disabled = movement.isRingOccupied(entryIdx, gameState.players);
        options.push({ kind: 'ring', laneId, index: entryIdx, disabled });
      } else {
        // Player exits to ring and moves further
        const remainingSteps = steps - (laneSteps + 1);
        const cwTarget = (entryIdx + remainingSteps) % 24;
        const ccwTarget = (entryIdx - remainingSteps + 24) % 24;
        
        // Only add if targets are different (avoid duplicate options)
        if (cwTarget !== ccwTarget) {
          options.push({ 
            kind: 'ring', laneId, index: cwTarget, direction: 'cw', 
            remainingSteps, disabled: movement.isRingOccupied(cwTarget, gameState.players) 
          });
          options.push({ 
            kind: 'ring', laneId, index: ccwTarget, direction: 'ccw', 
            remainingSteps, disabled: movement.isRingOccupied(ccwTarget, gameState.players) 
          });
        } else {
          // Same target for both directions
          options.push({ 
            kind: 'ring', laneId, index: cwTarget, direction: 'cw', 
            remainingSteps, disabled: movement.isRingOccupied(cwTarget, gameState.players) 
          });
        }
      }
    }
    
    // Filter out disabled options if there are enabled ones
    const enabledOptions = options.filter(opt => !opt.disabled);
    const finalOptions = enabledOptions.length > 0 ? enabledOptions : options;
    
    if (finalOptions.length === 0) {
      return null; // No valid moves
    }
    
    const choice = await overlayChoice<any>({ type: 'center-exit', options: finalOptions });
    
    return {
      newPlayer: { 
        ...player, 
        state: 'lane' as const, 
        lane: { id: choice.laneId, depth: 3, dir: 'out' as const } 
      },
      remainingSteps: steps,
      direction: choice.direction
    };
  }, [movement]);

  const handleRingEntry = useCallback(async (player: Player) => {
    const laneEntries = [0, 6, 12, 18];
    const entryIndex = (laneId: number) => (laneEntries[laneId] - 1 + 24) % 24;
    
    const laneId = laneEntries.findIndex(entry => entryIndex(entry) === player.pos);
    if (laneId === -1) return null;
    
    const nextRing = (player.pos + 1) % 24;
    const ringDisabled = movement.isRingOccupied(nextRing, gameState.players);
    const laneDisabled = player.badges.size < 6 || movement.isLaneOccupied(laneId, 1, gameState.players);
    
    if (laneDisabled && ringDisabled) return null;
    if (laneDisabled) return null; // Must continue on ring
    if (ringDisabled) {
      // Must enter lane
      return { 
        ...player, 
        state: 'lane' as const, 
        lane: { id: laneId, depth: 1, dir: 'in' as const } 
      };
    }
    
    const choice = await overlayChoice<'ring' | 'lane'>({ 
      type: 'ring-or-lane', 
      ringIndex: nextRing, 
      ringDisabled, 
      laneId, 
      laneDisabled 
    });
    
    if (choice === 'lane') {
      return { 
        ...player, 
        state: 'lane' as const, 
        lane: { id: laneId, depth: 1, dir: 'in' as const } 
      };
    }
    
    return null;
  }, [movement]);

  const handleDirectionChoice = useCallback(async (player: Player, steps: number) => {
    if (player.state !== 'ring') return null;
    
    const cwNext = (player.pos + 1) % 24;
    const ccwNext = (player.pos - 1 + 24) % 24;
    const cwTarget = (player.pos + steps) % 24;
    const ccwTarget = (player.pos - steps + 24) % 24;
    const cwDisabled = movement.isRingOccupied(cwNext, gameState.players);
    const ccwDisabled = movement.isRingOccupied(ccwNext, gameState.players);
    
    if (cwDisabled && ccwDisabled) return null;
    if (cwDisabled) return 'ccw';
    if (ccwDisabled) return 'cw';
    
    // Both directions available - ask user
    return await overlayChoice<'cw' | 'ccw'>({ 
      type: 'direction', 
      cwIndex: cwTarget, 
      ccwIndex: ccwTarget, 
      cwDisabled, 
      ccwDisabled 
    });
  }, [movement]);

  const handleLandingAction = useCallback(async (player: Player) => {
    // Check victory condition first
    if (player.state === 'center' && player.badges.size >= 6) {
      setTimeout(() => {
        alert('🏆 Congratulations! You returned to center with all badges — you won!');
      }, 500);
      return;
    }

    if (player.state === 'ring') {
      const category = gameState.boardCategories[player.pos];
      
      if (category === 'roll') {
        setTimeout(() => {
          alert('🎲 Roll Again!');
        }, 100);
        // Don't advance turn - same player rolls again
        return;
      } else {
        // Ask question - if multiplayer, notify others
        if (isMultiplayer && realtimeGame.socket) {
          // Fetch a question and broadcast
          try {
            const res = await fetch(`/api/questions/random?category=${category}&count=1`);
            let injected = null as any;
            if (res.ok) {
              const data = await res.json();
              injected = (data.questions && data.questions[0]) || null;
            }
            setQuestionModal({ isOpen: true, category, readOnly: false, injectedQuestion: injected, askedBy: realtimeGame.assignedColor });
            try {
              const s: any = realtimeGame.socket;
              if (s && s.connected) {
                const payload = injected
                  ? { category, question: injected.q, options: injected.opts }
                  : { category, question: 'Question', options: [] };
                s.emit('questionOpened', payload);
              }
            } catch {}
          } catch {
            setQuestionModal({ isOpen: true, category });
          }
        } else {
          setQuestionModal({ isOpen: true, category });
        }
        return;
      }
    } else if (player.state === 'lane' && player.lane) {
      const laneCategories = ['science', 'history', 'art', 'sports', 'geography', 'entertainment'];
      const category = laneCategories[player.lane.id % laneCategories.length];
      
      setQuestionModal({ isOpen: true, category });
      return;
    }

    // If no special action, advance to next player
    gameState.nextPlayer();
  }, [gameState]);

  // Helper: show overlay and wait for user choice
  function overlayChoice<T = any>(ov: BoardOverlay): Promise<T> {
    return new Promise<T>((resolve) => {
      setOverlay(ov);
      (window as any).__overlayChoice = (val: T) => {
        setOverlay(null);
        resolve(val);
      };
    });
  }

  const handleQuestionAnswer = useCallback((correct: boolean) => {
    if (isMultiplayer) {
      // Server advances turn and broadcasts result
      realtimeGame.answerQuestion(correct);
      setQuestionModal({ isOpen: false, category: '', readOnly: false, injectedQuestion: null, askedBy: undefined });
      return;
    }
    if (correct) {
      const category = questionModal.category;
      gameState.addBadge(gameState.currentPlayer, category);
      gameState.addGold(10);
      const currentPlayer = gameState.players[gameState.currentPlayer];
      if (currentPlayer.badges.size >= 6) {
        setTimeout(() => {
          alert('🎉 Tüm rozetleri topladın! Artık merkeze gidebilirsin!');
        }, 1000);
      }
    }
    setQuestionModal({ isOpen: false, category: '', readOnly: false, injectedQuestion: null, askedBy: undefined });
    gameState.nextPlayer();
  }, [gameState, questionModal.category, isMultiplayer, realtimeGame]);

  const handleCloseModal = useCallback(() => {
    setQuestionModal({ isOpen: false, category: '', readOnly: false, injectedQuestion: null, askedBy: undefined });
    if (!isMultiplayer) {
      gameState.nextPlayer();
    }
  }, [gameState, isMultiplayer]);

  // Avoid SSR hydration drift by only rendering board after mount
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  // Multiplayer animated movement using server state and emitting steps
  const performAnimatedMovementMultiplayer = useCallback(async (steps: number) => {
    console.log(`performAnimatedMovementMultiplayer called with ${steps} steps`);
    if (!realtimeGame.gameState || !realtimeGame.assignedColor) {
      console.log('Missing game state or assigned color:', { gameState: !!realtimeGame.gameState, assignedColor: realtimeGame.assignedColor });
      return;
    }
    // Build temporary player map in local shape
    const serverPlayers = realtimeGame.gameState.players as any;
    const toLocalPlayer = (sp: any): Player => ({
      id: sp.id,
      name: sp.name,
      color: sp.color,
      state: sp.state,
      pos: sp.pos,
      offset: sp.offset,
      badges: new Set(sp.badges || []),
      gold: sp.gold || 0,
      lane: sp.lane ? { ...sp.lane } : null
    } as any);
    let currentPlayer = toLocalPlayer(serverPlayers[realtimeGame.assignedColor]);
    const others: Record<string, Player> = {} as any;
    Object.keys(serverPlayers).forEach(k => { others[k] = toLocalPlayer(serverPlayers[k]); });
    let remainingSteps = steps;
    let moved = false;
    let direction: 'cw' | 'ccw' | null = null;
    let directionChosen = false;

    if (currentPlayer.state === 'center') {
      const choice = await handleCenterExit(currentPlayer, steps);
      if (!choice) { return; }
      currentPlayer = choice.newPlayer;
      await realtimeGame.movePlayer({ state: 'lane', pos: currentPlayer.pos, lane: { id: choice.newPlayer.lane!.id, depth: 3, dir: 'out' } });
      direction = choice.direction || 'cw';
      directionChosen = !!choice.direction;
      remainingSteps = Math.max(0, remainingSteps - 1);
      moved = true;
      await new Promise(r => setTimeout(r, 250));
    } else if (currentPlayer.state === 'ring') {
      const laneChoice = await handleRingEntry(currentPlayer);
      if (laneChoice) {
        currentPlayer = laneChoice;
        await realtimeGame.movePlayer({ state: 'lane', pos: currentPlayer.pos, lane: laneChoice.lane });
        remainingSteps--;
      }
      if (currentPlayer.state === 'ring') {
        const dirChoice = await handleDirectionChoice(currentPlayer, remainingSteps);
        if (dirChoice) { direction = dirChoice; directionChosen = true; }
      }
    }

    let stepCount = 0;
    while (remainingSteps > 0 && stepCount < steps) {
      const stepResult = movement.movePlayerStep(currentPlayer, others as any, direction || undefined);
      if (!stepResult.success) break;
      currentPlayer = { ...currentPlayer, ...stepResult.newState } as any;
      await realtimeGame.movePlayer(stepResult.newState as any);
      moved = true;
      remainingSteps--; stepCount++;
      await new Promise(r => setTimeout(r, 400));
      // Check if player has moved from lane to ring, requiring direction choice
      const previousState = (stepResult as any).prevState;
      if (previousState === 'lane' && (currentPlayer as any).state === 'ring' && remainingSteps > 0 && !directionChosen) {
        const dirChoiceMid = await handleDirectionChoice(currentPlayer, remainingSteps);
        if (dirChoiceMid) { direction = dirChoiceMid; directionChosen = true; }
      }
      if ((currentPlayer as any).state === 'center') break;
    }
    if (!moved) return;
    await handleLandingAction(currentPlayer);
  }, [realtimeGame, movement, handleCenterExit, handleRingEntry, handleDirectionChoice, handleLandingAction]);

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Wallet & Multiplayer Controls */}
      <div className="space-y-3">
        {/* Wallet Connection */}
        <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-white text-sm font-medium">Wallet</span>
            <WalletBadge />
          </div>
          <WalletButton />
        </div>

        {/* Multiplayer (auto-matchmaking) */}
        <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">Multiplayer: Auto Matchmaking</span>
            <div className={`w-2 h-2 rounded-full ${realtimeGame.isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
          </div>
          {realtimeGame.gameState && (
            <div className="text-xs text-white/70">
              {Object.values(realtimeGame.gameState.players || {}).filter((p: any) => p.isConnected).length} players
            </div>
          )}
        </div>
      </div>

      {/* Top HUD (dice + gold) with waiting room gating */}
      <div className="relative">
        {isMultiplayer && (realtimeGame.lobby?.status !== 'playing') && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 rounded-lg">
            <div className="text-center text-white space-y-2">
              <div className="text-lg font-bold">Waiting for players…</div>
              <div className="text-sm text-white/80">{realtimeGame.lobby?.connected || 0} / 4 joined</div>
            </div>
          </div>
        )}
        <GameHUD
          currentPlayer={(isMultiplayer && realtimeGame.gameState ? (realtimeGame.gameState.currentPlayer as any) : gameState.currentPlayer)}
          gold={gameState.gold}
          diceValue={(isMultiplayer && realtimeGame.gameState ? realtimeGame.gameState.diceValue : gameState.diceValue)}
          onRollDice={handleRollDice}
          players={(isMultiplayer && realtimeGame.gameState ? (Object.fromEntries(Object.entries(realtimeGame.gameState.players as any).map(([k, sp]: any) => [k, { ...sp, badges: new Set(sp.badges || []) }])) as any) : gameState.players)}
          walletAddress={wallet.address || undefined}
        />
      </div>

      {/* Larger board */}
      <div className="board-container">
        <div className="w-full max-w-[560px] mx-auto">
          {isClient && (
            <GameBoard
              players={(isMultiplayer && realtimeGame.gameState ? (Object.fromEntries(Object.entries(realtimeGame.gameState.players as any).map(([k, sp]: any) => [k, { ...sp, badges: new Set(sp.badges || []) }])) as any) : gameState.players)}
              categories={(isMultiplayer && realtimeGame.gameState ? ((realtimeGame.gameState as any).boardCategories || gameState.boardCategories) : gameState.boardCategories)}
              overlay={overlay}
              onOverlayChoice={(v) => {
                const cb = (window as any).__overlayChoice;
                if (cb) cb(v);
              }}
            />
          )}
        </div>
      </div>

      <QuestionModal
        isOpen={questionModal.isOpen}
        category={questionModal.category}
        onAnswer={handleQuestionAnswer}
        onClose={handleCloseModal}
        walletAddress={wallet.address || undefined}
        readOnly={!!questionModal.readOnly}
        initialQuestion={questionModal.injectedQuestion || undefined as any}
      />

      {/* Players strip large avatars - grid (no horizontal scroll on mobile) */}
      <div className="grid grid-cols-4 gap-2 pb-3 pt-2">
        {(
          useMemo(() => {
            const basePlayers = (isMultiplayer && realtimeGame.gameState)
              ? (Object.fromEntries(
                  Object.entries(realtimeGame.gameState.players as any).map(([k, sp]: any) => [k, { ...sp, badges: new Set(sp.badges || []) }])
                ) as any)
              : gameState.players;
            return Object.values(basePlayers) as any[];
          }, [isMultiplayer, realtimeGame.gameState, gameState.players])
        ).map((player: any) => {
          const avatarMap: Record<string, string> = {
            red: '/img/avatar-red.png',
            green: '/img/avatar-green.png',
            blue: '/img/avatar-blue.png',
            yellow: '/img/avatar-yellow.png',
          };

          return (
            <div key={player.id} className={`p-2 rounded-xl border ${
              player.id === (isMultiplayer && realtimeGame.gameState ? (realtimeGame.gameState.currentPlayer as any) : gameState.currentPlayer) ? 'border-yellow-400 bg-yellow-100/10 shadow-md' : 'border-gray-700 bg-[#1a1b28]'
            }`}>
              <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-black overflow-hidden mx-auto mb-1 bg-${player.id}-color`}>
                <div className="relative w-full h-full">
                  <Image 
                    src={avatarMap[player.id] || '/img/avatar-blue.png'} 
                    alt={player.id} 
                    className="object-contain" 
                    fill
                    sizes="(max-width: 768px) 56px, 64px"
                  />
                </div>
              </div>
              <div className="text-[10px] sm:text-xs font-bold text-center capitalize text-gray-200 truncate">
                {player.id}
                {isMultiplayer && realtimeGame.assignedColor === (player.id as any) && <span className="ml-1 text-blue-400">(you)</span>}
              </div>
              <div className="grid grid-cols-3 gap-1 place-items-center mt-1 min-h-[18px]">
                {Array.from(player.badges as Set<string>).map((badge, i) => (
                  <div
                    key={`${badge}-${i}`}
                    className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full border border-gray-500 badge-${badge.toLowerCase()}`}
                    title={badge}
                  />
                ))}
                {Array.from({ length: Math.max(0, 6 - player.badges.size) }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full border-2 border-dashed border-gray-600 bg-gray-800"
                    title=""
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Debug info */}
      <div className="text-xs text-gray-400 mt-4">
        <details>
          <summary className="cursor-pointer hover:text-gray-300">Debug Info</summary>
          <pre className="mt-2 text-xs bg-slate-800 text-gray-300 p-3 rounded-lg overflow-auto border border-slate-700">
            Current: {gameState.currentPlayer}
            {'\n'}Gold: {gameState.gold}
            {'\n'}Dice: {gameState.diceValue}
            {'\n'}Player States: {JSON.stringify(
              Object.fromEntries(
                Object.entries(gameState.players).map(([id, p]) => [
                  id, 
                  { state: p.state, pos: p.pos, badges: p.badges.size, lane: p.lane }
                ])
              ), 
              null, 
              2
            )}
          </pre>
        </details>
      </div>
    </div>
  );
}

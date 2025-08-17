"use client";

import { useMemo } from "react";
import "./GameStyles.css";
import { Player } from "../hooks/useGameState";

type DirectionChoiceOverlay = {
  type: 'direction';
  cwIndex: number;
  cwDisabled?: boolean;
  ccwIndex: number;
  ccwDisabled?: boolean;
};

type RingOrLaneOverlay = {
  type: 'ring-or-lane';
  ringIndex: number;
  ringDisabled?: boolean;
  laneId: number;
  laneDisabled?: boolean;
};

type CenterExitOption =
  | { kind: 'lane'; laneId: number; depth: number; disabled?: boolean }
  | { kind: 'ring'; laneId: number; index: number; remainingSteps?: number; direction?: 'cw' | 'ccw'; disabled?: boolean };

type CenterExitOverlay = {
  type: 'center-exit';
  options: CenterExitOption[];
};

export type BoardOverlay = DirectionChoiceOverlay | RingOrLaneOverlay | CenterExitOverlay | null;

interface GameBoardProps {
  players: Record<string, Player>;
  categories: string[];
  overlay?: BoardOverlay;
  onOverlayChoice?: (value: unknown) => void;
}

const BOARD_CONFIG = {
  segments: 24,
  innerR: 150,
  outerR: 225
};

const CATEGORY_COLORS = {
  science: '#00b6b4',
  history: '#f1c40f',
  art: '#e91e63',
  sports: '#27ae60',
  geography: '#3498db',
  entertainment: '#8e44ad',
  roll: '#b0bec5'
};

export default function GameBoard({ players, categories, overlay, onOverlayChoice }: GameBoardProps) {
  const { segments, points, laneGeometry } = useMemo(() => {
    const delta = (2 * Math.PI) / BOARD_CONFIG.segments;
    const ringRot = delta / 2;
    const tokenPathR = (BOARD_CONFIG.innerR + BOARD_CONFIG.outerR) / 2;

    // Calculate ring points
    const ringPoints = [];
    for (let i = 0; i < BOARD_CONFIG.segments; i++) {
      const angle = ((i + 0.5) * delta + ringRot) - Math.PI / 2;
      ringPoints.push({
        angle,
        x: Math.cos(angle) * tokenPathR,
        y: Math.sin(angle) * tokenPathR
      });
    }

    // Generate segment paths
    const segmentPaths = [];
    for (let i = 0; i < BOARD_CONFIG.segments; i++) {
      const a0 = (i * delta + ringRot) - Math.PI / 2;
      const a1 = ((i + 1) * delta + ringRot) - Math.PI / 2;
      
      const p1 = {
        x: BOARD_CONFIG.innerR * Math.cos(a0),
        y: BOARD_CONFIG.innerR * Math.sin(a0)
      };
      const p2 = {
        x: BOARD_CONFIG.outerR * Math.cos(a0),
        y: BOARD_CONFIG.outerR * Math.sin(a0)
      };
      const p3 = {
        x: BOARD_CONFIG.outerR * Math.cos(a1),
        y: BOARD_CONFIG.outerR * Math.sin(a1)
      };
      const p4 = {
        x: BOARD_CONFIG.innerR * Math.cos(a1),
        y: BOARD_CONFIG.innerR * Math.sin(a1)
      };
      
      const path = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${BOARD_CONFIG.outerR} ${BOARD_CONFIG.outerR} 0 0 1 ${p3.x} ${p3.y} L ${p4.x} ${p4.y} A ${BOARD_CONFIG.innerR} ${BOARD_CONFIG.innerR} 0 0 0 ${p1.x} ${p1.y} Z`;
      segmentPaths.push(path);
    }

    // Generate lane geometry
    // Match HTML: LANE_ENTRIES = [0,6,12,18] then ENTRY_INDEXES = (idx-1+segments)%segments
    const ENTRY_INDEXES = [0, 6, 12, 18].map(idx => (idx - 1 + BOARD_CONFIG.segments) % BOARD_CONFIG.segments);
    const lanes = [] as Array<Array<{x:number;y:number;width:number;height:number;theta:number;rc:number}>>;
    const laneSteps = 3;
    
    ENTRY_INDEXES.forEach((entryIdx, laneId) => {
      // Match HTML lane angle (without ringRot)
      const theta = ( (([0,6,12,18][laneId]) * delta) ) - Math.PI / 2;
      const lane = [];
      const rStart = BOARD_CONFIG.innerR - 10;
      const rEnd = 40;
      const gap = 6;
      const L = rStart - rEnd;
      const stepLen = (L - gap * (laneSteps - 1)) / laneSteps;
      for (let j = 0; j < laneSteps; j++) {
        const rc = rStart - (j + 0.5) * stepLen - j * gap;
        const cx = Math.cos(theta) * rc;
        const cy = Math.sin(theta) * rc;
        lane.push({
          x: cx,
          y: cy,
          width: stepLen,
          height: 28,
          theta,
          rc
        });
      }
      lanes.push(lane);
    });

    return {
      segments: segmentPaths,
      points: ringPoints,
      laneGeometry: lanes
    };
  }, []);

  return (
    <div className="w-full max-w-md mx-auto">
      <svg viewBox="-300 -300 600 600" className="board-aspect">
        {/* Board segments */}
        <g id="segments">
          {segments.map((path, i) => (
            <path
              key={i}
              d={path}
              fill={CATEGORY_COLORS[categories[i] as keyof typeof CATEGORY_COLORS] || '#666'}
              stroke="#111"
              strokeWidth="1"
              fillOpacity={i % 2 ? 0.95 : 1}
            />
          ))}
          
          {/* ROLL text labels */}
          {categories.map((cat, i) => (
            cat === 'roll' && (
              <text
                key={`roll-${i}`}
                x={points[i].x}
                y={points[i].y + 4}
                textAnchor="middle"
                fontSize="12"
                fill="#111"
                transform={`rotate(${(points[i].angle * 180 / Math.PI)}, ${points[i].x}, ${points[i].y})`}
              >
                ROLL
              </text>
            )
          ))}
          
          {/* Border circles */}
          <circle
            r={BOARD_CONFIG.outerR}
            fill="none"
            stroke="#111"
            strokeWidth="2"
          />
          <circle
            r={BOARD_CONFIG.innerR}
            fill="none"
            stroke="#111"
            strokeWidth="2"
          />
        </g>

        {/* Lanes */}
        <g id="lanes">
          {laneGeometry.map((lane, laneId) =>
            lane.map((segment, stepId) => (
              <rect
                key={`lane-${laneId}-${stepId}`}
                x={segment.x - segment.width / 2}
                y={segment.y - segment.height / 2}
                width={segment.width}
                height={segment.height}
                fill={CATEGORY_COLORS[categories[(laneId * 6 + stepId) % 6] as keyof typeof CATEGORY_COLORS] || '#444'}
                stroke="#222"
                strokeWidth="1"
                transform={`rotate(${segment.theta * 180 / Math.PI}, ${segment.x}, ${segment.y})`}
              />
            ))
          )}
        </g>

        {/* Center hub */}
        <circle
          r="30"
          fill="#1a1a1a"
          stroke="#333"
          strokeWidth="3"
        />

        {/* Player tokens */}
        <g id="tokens">
          {Object.values(players).map((player) => {
            let x = 0, y = 0;
            
            if (player.state === 'center') {
              // Center position with offset
              const centerPlayers = Object.values(players).filter(p => p.state === 'center');
              const angle = (player.offset * 2 * Math.PI) / Math.max(centerPlayers.length, 4);
              const radius = 18;
              x = Math.cos(angle) * radius;
              y = Math.sin(angle) * radius;
            } else if (player.state === 'ring') {
              // Ring position
              const point = points[player.pos];
              const offsetRadius = (BOARD_CONFIG.innerR + BOARD_CONFIG.outerR) / 2 + player.offset * 0.15;
              x = Math.cos(point.angle) * offsetRadius;
              y = Math.sin(point.angle) * offsetRadius;
            } else if (player.state === 'lane' && player.lane) {
              // Lane position
              const lane = laneGeometry[player.lane.id];
              if (lane && lane[player.lane.depth - 1]) {
                const segment = lane[player.lane.depth - 1];
                const nx = -Math.sin(segment.theta);
                const ny = Math.cos(segment.theta);
                x = segment.x + nx * player.offset * 0.3;
                y = segment.y + ny * player.offset * 0.3;
              }
            }

            const getPlayerAvatar = (playerId: string) => {
              const avatarMap = {
                'red': '/img/avatar-red.png',
                'green': '/img/avatar-green.png', 
                'blue': '/img/avatar-blue.png',
                'yellow': '/img/avatar-yellow.png'
              };
              return avatarMap[playerId as keyof typeof avatarMap] || '/img/avatar-blue.png';
            };

            return (
              <g 
                key={player.id} 
                transform={`translate(${x}, ${y})`}
                className="player-token"
              >
                {/* Token shadow/base */}
                <ellipse
                  cx="0"
                  cy="2"
                  rx="14"
                  ry="6"
                  fill="rgba(0,0,0,0.2)"
                  className="token-shadow"
                />
                
                {/* 3D Token base */}
                <circle
                  r="13"
                  fill={player.color}
                  stroke="#000"
                  strokeWidth="1.5"
                  className={`player-token-body ${player.id === Object.keys(players)[0] ? 'player-token-current' : ''}`}
                />
                
                {/* Inner highlight for 3D effect */}
                <circle
                  r="11"
                  fill="url(#tokenGradient)"
                  opacity="0.3"
                />
                
                {/* Avatar image */}
                <image
                  href={getPlayerAvatar(player.id)}
                  x="-8"
                  y="-8"
                  width="16"
                  height="16"
                  clipPath="url(#tokenClip)"
                />
                
                {/* Badge indicators around token */}
                {player.badges.size > 0 && (
                  <g className="badge-halo">
                    {Array.from(player.badges).map((badge, i) => {
                      const badgeAngle = (i * 2 * Math.PI) / Math.max(player.badges.size, 6) - Math.PI / 2;
                      const badgeRadius = 18;
                      const bx = Math.cos(badgeAngle) * badgeRadius;
                      const by = Math.sin(badgeAngle) * badgeRadius;
                      
                      return (
                        <g key={badge} transform={`translate(${bx}, ${by})`}>
                          <circle
                            r="4"
                            fill={CATEGORY_COLORS[badge as keyof typeof CATEGORY_COLORS] || '#fff'}
                            stroke="#000"
                            strokeWidth="1"
                          />
                          <circle
                            r="2.5"
                            fill="rgba(255,255,255,0.4)"
                          />
                        </g>
                      );
                    })}
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* Token gradient and clip definitions */}
        <defs>
          <radialGradient id="tokenGradient" cx="30%" cy="30%">
            <stop offset="0%" stopColor="white" stopOpacity="0.8"/>
            <stop offset="100%" stopColor="white" stopOpacity="0"/>
          </radialGradient>
          <clipPath id="tokenClip">
            <circle r="8"/>
          </clipPath>
        </defs>

        {/* Overlay choices */}
        {overlay && (
          <g id="choices">
            {overlay.type === 'direction' && (
              <>
                <path
                  d={(segments[(overlay as DirectionChoiceOverlay).cwIndex])}
                  className="target"
                  opacity={(overlay as DirectionChoiceOverlay).cwDisabled ? 0.4 : 1}
                  onClick={() => !(overlay as DirectionChoiceOverlay).cwDisabled && onOverlayChoice && onOverlayChoice('cw')}
                />
                <path
                  d={(segments[(overlay as DirectionChoiceOverlay).ccwIndex])}
                  className="target"
                  opacity={(overlay as DirectionChoiceOverlay).ccwDisabled ? 0.4 : 1}
                  onClick={() => !(overlay as DirectionChoiceOverlay).ccwDisabled && onOverlayChoice && onOverlayChoice('ccw')}
                />
              </>
            )}

            {overlay.type === 'ring-or-lane' && (
              <>
                <path
                  d={(segments[(overlay as RingOrLaneOverlay).ringIndex])}
                  className="target"
                  opacity={(overlay as RingOrLaneOverlay).ringDisabled ? 0.4 : 1}
                  onClick={() => !(overlay as RingOrLaneOverlay).ringDisabled && onOverlayChoice && onOverlayChoice('ring')}
                />
                {(() => {
                  const ov = overlay as RingOrLaneOverlay;
                  const s = laneGeometry[ov.laneId]?.[0];
                  if (!s) return null;
                  return (
                    <rect
                      x={s.x - s.width / 2}
                      y={s.y - s.height / 2}
                      width={s.width}
                      height={s.height}
                      className="target"
                      transform={`rotate(${(s.theta * 180) / Math.PI}, ${s.x}, ${s.y})`}
                      opacity={ov.laneDisabled ? 0.4 : 1}
                      onClick={() => !ov.laneDisabled && onOverlayChoice && onOverlayChoice('lane')}
                    />
                  );
                })()}
              </>
            )}

            {overlay.type === 'center-exit' && (
              <>
                {(overlay as CenterExitOverlay).options.map((opt, i) => {
                  if (opt.kind === 'lane') {
                    // Show lane exit target at the specified depth
                    const s = laneGeometry[opt.laneId]?.[opt.depth - 1];
                    if (!s) return null;
                    return (
                      <rect
                        key={`lane-${i}`}
                        x={s.x - s.width / 2}
                        y={s.y - s.height / 2}
                        width={s.width}
                        height={s.height}
                        className="target"
                        transform={`rotate(${(s.theta * 180) / Math.PI}, ${s.x}, ${s.y})`}
                        opacity={opt.disabled ? 0.4 : 1}
                        onClick={() => !opt.disabled && onOverlayChoice && onOverlayChoice(opt)}
                      />
                    );
                  } else if (opt.kind === 'ring') {
                    // Show ring target at the final position
                    return (
                      <path
                        key={`ring-${i}`}
                        d={segments[opt.index]}
                        className="target"
                        opacity={opt.disabled ? 0.4 : 1}
                        onClick={() => !opt.disabled && onOverlayChoice && onOverlayChoice(opt)}
                      />
                    );
                  }
                  return null;
                })}
              </>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}

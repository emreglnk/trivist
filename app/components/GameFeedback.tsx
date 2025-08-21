"use client";

import { useState, useEffect } from 'react';

interface GameFeedbackProps {
  className?: string;
}

export interface FeedbackMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  duration?: number; // ms, default 4000
  persistent?: boolean; // if true, won't auto-dismiss
}

// Global feedback state
let feedbackMessages: FeedbackMessage[] = [];
let feedbackListeners: ((messages: FeedbackMessage[]) => void)[] = [];

export const GameFeedbackAPI = {
  addMessage: (message: Omit<FeedbackMessage, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newMessage: FeedbackMessage = {
      id,
      duration: 4000,
      ...message,
    };
    
    feedbackMessages = [...feedbackMessages, newMessage];
    feedbackListeners.forEach(listener => listener(feedbackMessages));
    
    // Auto-dismiss after duration unless persistent
    if (!newMessage.persistent) {
      setTimeout(() => {
        GameFeedbackAPI.removeMessage(id);
      }, newMessage.duration);
    }
    
    return id;
  },
  
  removeMessage: (id: string) => {
    feedbackMessages = feedbackMessages.filter(msg => msg.id !== id);
    feedbackListeners.forEach(listener => listener(feedbackMessages));
  },
  
  clearAll: () => {
    feedbackMessages = [];
    feedbackListeners.forEach(listener => listener(feedbackMessages));
  },
  
  // Helper methods for common feedback types
  showTurnInfo: (playerName: string, action: string) => {
    GameFeedbackAPI.addMessage({
      type: 'info',
      title: 'Turn Update',
      message: `${playerName} ${action}`,
      duration: 3000,
    });
  },
  
  showDiceRoll: (playerName: string, diceValue: number) => {
    GameFeedbackAPI.addMessage({
      type: 'info',
      title: '🎲 Dice Roll',
      message: `${playerName} rolled a ${diceValue}`,
      duration: 3000,
    });
  },
  
  showCategorySelection: (playerName: string, category: string) => {
    GameFeedbackAPI.addMessage({
      type: 'info',
      title: '📚 Category',
      message: `${playerName} landed on ${category.toUpperCase()}`,
      duration: 4000,
    });
  },
  
  showAnswerResult: (playerName: string, correct: boolean, nextPlayer?: string) => {
    GameFeedbackAPI.addMessage({
      type: correct ? 'success' : 'warning',
      title: correct ? '✅ Correct!' : '❌ Incorrect',
      message: correct 
        ? `${playerName} answered correctly and keeps the turn!`
        : `${playerName} answered incorrectly. ${nextPlayer ? `${nextPlayer}'s turn now.` : 'Turn passes to next player.'}`,
      duration: 4000,
    });
  },
  
  showRollAgain: (playerName: string) => {
    GameFeedbackAPI.addMessage({
      type: 'success',
      title: '🎲 Roll Again!',
      message: `${playerName} gets to roll again!`,
      duration: 3000,
    });
  },
  
  showGameEntry: (playerName: string, success: boolean) => {
    GameFeedbackAPI.addMessage({
      type: success ? 'success' : 'error',
      title: success ? '🎮 Game Entered' : '❌ Entry Failed',
      message: success 
        ? `${playerName} entered the game! (25 TRIV deducted)`
        : `Failed to enter game. Check your TRIV balance.`,
      duration: 4000,
    });
  },
  
  showTokenClaim: (playerName: string, success: boolean, amount?: string) => {
    GameFeedbackAPI.addMessage({
      type: success ? 'success' : 'error',
      title: success ? '🪙 Tokens Claimed' : '❌ Claim Failed',
      message: success 
        ? `${playerName} claimed ${amount || '50'} TRIV tokens!`
        : `Failed to claim daily tokens. Try again later.`,
      duration: 4000,
    });
  },
};

export default function GameFeedback({ className = '' }: GameFeedbackProps) {
  const [messages, setMessages] = useState<FeedbackMessage[]>(feedbackMessages);
  
  useEffect(() => {
    const listener = (newMessages: FeedbackMessage[]) => {
      setMessages([...newMessages]);
    };
    
    feedbackListeners.push(listener);
    
    return () => {
      feedbackListeners = feedbackListeners.filter(l => l !== listener);
    };
  }, []);
  
  const getMessageIcon = (type: FeedbackMessage['type']) => {
    switch (type) {
      case 'success': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      default: return 'ℹ️';
    }
  };
  
  const getMessageColors = (type: FeedbackMessage['type']) => {
    switch (type) {
      case 'success': return 'bg-green-600/90 border-green-500';
      case 'warning': return 'bg-yellow-600/90 border-yellow-500';
      case 'error': return 'bg-red-600/90 border-red-500';
      default: return 'bg-blue-600/90 border-blue-500';
    }
  };
  
  if (messages.length === 0) return null;
  
  return (
    <div className={`fixed top-4 right-4 z-50 space-y-2 max-w-sm ${className}`}>
      {messages.map((message) => (
        <div
          key={message.id}
          className={`p-3 rounded-lg border backdrop-blur-sm text-white shadow-lg animate-slide-in-right ${getMessageColors(message.type)}`}
        >
          <div className="flex items-start gap-2">
            <span className="text-lg flex-shrink-0">
              {getMessageIcon(message.type)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">
                {message.title}
              </div>
              <div className="text-xs text-white/90 mt-1">
                {message.message}
              </div>
            </div>
            {!message.persistent && (
              <button
                onClick={() => GameFeedbackAPI.removeMessage(message.id)}
                className="text-white/70 hover:text-white text-xs ml-2 flex-shrink-0"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

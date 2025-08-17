"use client";

import { useState, useEffect, useCallback } from "react";
import { useTokenSystem } from "../hooks/useTokenSystem";
import Image from "next/image";

interface Question {
  q: string;
  opts: string[];
  a: number;
}

interface QuestionModalProps {
  isOpen: boolean;
  category: string;
  onAnswer: (correct: boolean) => void;
  onClose: () => void;
  walletAddress?: string;
  readOnly?: boolean;
  initialQuestion?: Question | null;
}

const QUESTIONS: Record<string, Question[]> = {
  science: [
    { q: 'Which planet is known as the Red Planet?', opts: ['Venus', 'Mars', 'Jupiter', 'Mercury'], a: 1 },
    { q: 'What is the chemical symbol for water?', opts: ['H2O', 'CO2', 'NaCl', 'O2'], a: 0 },
    { q: 'How many bones are in the human body?', opts: ['206', '208', '210', '204'], a: 0 }
  ],
  history: [
    { q: 'The Roman Empire (West) fell in?', opts: ['476', '632', '1066', '1492'], a: 0 },
    { q: 'Who was the first President of the United States?', opts: ['Thomas Jefferson', 'George Washington', 'John Adams', 'Benjamin Franklin'], a: 1 },
    { q: 'In which year did World War II end?', opts: ['1944', '1945', '1946', '1947'], a: 1 }
  ],
  art: [
    { q: 'Mona Lisa was painted by…', opts: ['Michelangelo', 'Raphael', 'Da Vinci', 'Van Gogh'], a: 2 },
    { q: 'Which artist cut off his own ear?', opts: ['Picasso', 'Van Gogh', 'Monet', 'Renoir'], a: 1 },
    { q: 'The Starry Night was painted by?', opts: ['Van Gogh', 'Picasso', 'Monet', 'Da Vinci'], a: 0 }
  ],
  sports: [
    { q: 'Soccer team players on field?', opts: ['9', '10', '11', '12'], a: 2 },
    { q: 'How many players are on a basketball team?', opts: ['5', '6', '7', '8'], a: 0 },
    { q: 'In which sport do you use a shuttlecock?', opts: ['Tennis', 'Badminton', 'Squash', 'Table Tennis'], a: 1 }
  ],
  geography: [
    { q: 'Capital of Japan?', opts: ['Kyoto', 'Tokyo', 'Osaka', 'Nagoya'], a: 1 },
    { q: 'Which is the longest river in the world?', opts: ['Amazon', 'Nile', 'Yangtze', 'Mississippi'], a: 1 },
    { q: 'Mount Everest is located in?', opts: ['Nepal', 'India', 'Tibet', 'China'], a: 0 }
  ],
  entertainment: [
    { q: '"May the Force be with you" film?', opts: ['Star Trek', 'Star Wars', 'Matrix', 'Avatar'], a: 1 },
    { q: 'Who directed the movie "Jaws"?', opts: ['George Lucas', 'Steven Spielberg', 'Martin Scorsese', 'Francis Ford Coppola'], a: 1 },
    { q: 'Which movie won the first Academy Award for Best Picture?', opts: ['Wings', 'Sunrise', 'The Jazz Singer', 'All Quiet on the Western Front'], a: 0 }
  ]
};

export default function QuestionModal({ isOpen, category, onAnswer, onClose, walletAddress, readOnly = false, initialQuestion = null }: QuestionModalProps) {
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15);
  const { rewardCorrectAnswer } = useTokenSystem(walletAddress);

  const handleTimeout = useCallback(() => {
    if (!showFeedback) {
      setIsCorrect(false);
      setShowFeedback(true);
      setTimeout(() => {
        onAnswer(false);
        onClose();
      }, 2000);
    }
  }, [showFeedback, onAnswer, onClose]);

  // Timer effect
  useEffect(() => {
    if (!isOpen) return;
    
    setTimeLeft(15);
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, handleTimeout]);

  // Load question when modal opens
  useEffect(() => {
    if (isOpen && category) {
      const loadQuestion = async () => {
        try {
          if (initialQuestion) {
            setCurrentQuestion(initialQuestion);
            return;
          }
          if (readOnly) {
            // In readOnly mode we expect the question to be injected
            return;
          }
          const response = await fetch(`/api/questions/random?category=${category}&count=1`);
          if (response.ok) {
            const data = await response.json();
            if (data.questions && data.questions.length > 0) {
              setCurrentQuestion(data.questions[0]);
            } else {
              const questions = QUESTIONS[category] || QUESTIONS.science;
              const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
              setCurrentQuestion(randomQuestion);
            }
          } else {
            const questions = QUESTIONS[category] || QUESTIONS.science;
            const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
            setCurrentQuestion(randomQuestion);
          }
        } catch (error) {
          console.warn('Failed to load question from API, using local fallback:', error);
          // Fallback to local questions
          const questions = QUESTIONS[category] || QUESTIONS.science;
          const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
          setCurrentQuestion(randomQuestion);
        }
      };

      loadQuestion();
      setSelectedAnswer(null);
      setShowFeedback(false);
      setIsCorrect(false);
    }
  }, [isOpen, category, readOnly, initialQuestion]);

  // handleTimeout is now defined above where it's used

  const handleSubmit = useCallback(() => {
    if (selectedAnswer === null || !currentQuestion) return;
    
    const correct = selectedAnswer === currentQuestion.a;
    setIsCorrect(correct);
    setShowFeedback(true);
    
    // Reward TRIV tokens for correct answer
    if (!readOnly && correct && walletAddress) {
      rewardCorrectAnswer();
    }
    
    setTimeout(() => {
      onAnswer(correct);
      onClose();
    }, 2000);
  }, [selectedAnswer, currentQuestion, onAnswer, onClose, walletAddress, rewardCorrectAnswer, readOnly]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getCategoryImage = (cat: string) => {
    const images = {
      science: '/img/science.jpg',
      history: '/img/history.jpg',
      art: '/img/art.jpg',
      sports: '/img/sports.jpg',
      geography: '/img/geography.jpg',
      entertainment: '/img/entertainment.jpg'
    };
    return images[cat as keyof typeof images] || '/img/science.jpg';
  };

  if (!isOpen || !currentQuestion) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1e1f2a] text-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 duration-300 border border-white/10">
        {/* Header with category image */}
        <div className="relative h-32 overflow-hidden">
          <Image 
            src={getCategoryImage(category)}
            alt={category.toUpperCase()}
            className="w-full h-full object-cover"
            fill
            sizes="(max-width: 768px) 100vw, 480px"
            onError={(e) => {
              // Fallback to a solid color background if image fails to load
              const target = e.target as HTMLImageElement;
              if (target.parentElement) {
                target.style.display = 'none';
                target.parentElement.style.background = 'linear-gradient(135deg, #0f172a 0%, #1f2937 100%)';
              }
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-3 left-4 text-white/90 font-bold text-lg uppercase tracking-wide">
            {category}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Timer */}
          <div className="flex items-center justify-center mb-6">
            <div className={`px-4 py-2 rounded-full font-bold text-lg border-2 transition-all duration-300 ${
              timeLeft <= 5 
                ? 'bg-red-900/30 text-red-300 border-red-500/40 animate-pulse' 
                : timeLeft <= 10 
                ? 'bg-yellow-900/30 text-yellow-300 border-yellow-500/40'
                : 'bg-blue-900/30 text-blue-300 border-blue-500/40'
            }`}>
              {formatTime(timeLeft)}
            </div>
          </div>

          {/* Question */}
          <div className="text-xl font-semibold mb-8 text-gray-100 leading-relaxed">
            {currentQuestion.q}
          </div>

          {/* Options */}
          {!showFeedback && (
            <div className="space-y-3 mb-8">
              {currentQuestion.opts.map((option, index) => (
                <label
                  key={index}
                  className={`block p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 transform hover:scale-[1.02] ${
                    selectedAnswer === index
                      ? 'border-blue-400 bg-blue-900/30 shadow-md'
                      : 'border-white/10 hover:border-white/20 hover:bg-white/5 hover:shadow-sm'
                  } text-gray-100`}
                >
                  <input
                    type="radio"
                    name="answer"
                    value={index}
                    checked={selectedAnswer === index}
                    onChange={() => !readOnly && setSelectedAnswer(index)}
                    className="sr-only"
                  />
                  <div className="flex items-center">
                    <div className={`w-5 h-5 rounded-full border-2 mr-3 flex-shrink-0 transition-all ${
                      selectedAnswer === index
                        ? 'border-blue-400 bg-blue-500'
                        : 'border-white/30'
                    }`}>
                      {selectedAnswer === index && (
                        <div className="w-full h-full rounded-full bg-white scale-50"></div>
                      )}
                    </div>
                    <span className="text-gray-100 font-medium">{option}</span>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Feedback */}
          {showFeedback && (
            <div className={`text-center p-6 rounded-xl mb-8 transition-all duration-300 animate-in slide-in-from-top-2 ${
              isCorrect 
                ? 'bg-green-900/30 text-green-300 border-2 border-green-500/40 shadow-lg' 
                : 'bg-red-900/30 text-red-300 border-2 border-red-500/40 shadow-lg'
            }`}>
              <div className="text-2xl mb-2">
                {isCorrect ? '🎉' : '😞'}
              </div>
              <div className="font-bold text-lg">
                {isCorrect ? 'Great! You earned a badge!' : 'Wrong answer, try again!'}
              </div>
              {isCorrect && (
                <div className="text-sm mt-2 opacity-75">+1 TRIV earned!</div>
              )}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-white/10 text-white rounded-xl font-semibold hover:bg-white/15 transition-all duration-200 transform hover:scale-[1.02] border border-white/20"
            >
              Cancel
            </button>
            {!showFeedback && !readOnly && (
              <button
                onClick={handleSubmit}
                disabled={selectedAnswer === null}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] disabled:hover:scale-100 border border-green-500/40"
              >
                Submit Answer
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

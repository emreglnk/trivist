"use client";

import { useEffect } from "react";
import TriviaGame from "./components/TriviaGame";
import { useMiniKit } from "@coinbase/onchainkit/minikit";

export default function App() {
  const {setFrameReady, isFrameReady} = useMiniKit();

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full max-w-md mx-auto px-4 py-3">
        <header className="flex justify-between items-center mb-6 h-12">
          <div className="font-bold text-xl text-white">🎯 Trivia Game</div>
          <div className="text-sm text-blue-300 font-medium">Base Chain</div>
        </header>
        <main className="flex-1">
          <TriviaGame />
        </main>
      </div>
    </div>
  );
}

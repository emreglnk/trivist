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
        <main className="flex-1">
          <TriviaGame />
        </main>
      </div>
    </div>
  );
}

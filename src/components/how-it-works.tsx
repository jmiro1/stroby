"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

// 20-second animated sequence: Stroby introduces itself, benefits, no-risk, CTA
// Uses proven AIDA-like structure: Hook → Benefit → How → No-risk → CTA

interface Frame {
  role: "stroby" | "you";
  content: string;
  enterAt: number; // seconds
}

const FRAMES: Frame[] = [
  { role: "stroby", content: "Hey — I'm Stroby.", enterAt: 0.5 },
  { role: "stroby", content: "I find brand deals for you.", enterAt: 2 },
  { role: "stroby", content: "No pitch decks. No middlemen. No chasing.", enterAt: 4 },
  { role: "you", content: "How?", enterAt: 6.5 },
  { role: "stroby", content: "Tell me about your audience.", enterAt: 8 },
  { role: "stroby", content: "I find brands that fit.", enterAt: 9.5 },
  { role: "stroby", content: "You both say yes. I connect you.", enterAt: 11 },
  { role: "stroby", content: "Contact only shared when both agree. Zero spam.", enterAt: 13 },
  { role: "stroby", content: "Free to join. No commitment. ✨", enterAt: 15.5 },
  { role: "stroby", content: "Say hi on WhatsApp 👇", enterAt: 17.5 },
];

const LOOP_DURATION = 22; // seconds

export function HowItWorks() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(((Date.now() - start) / 1000) % LOOP_DURATION);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const visibleFrames = FRAMES.filter((f) => elapsed >= f.enterAt);

  return (
    <div className="mx-auto w-full max-w-sm">
      {/* Phone mockup */}
      <div className="relative overflow-hidden rounded-[2.5rem] border-8 border-foreground/10 bg-background shadow-2xl">
        {/* Header bar */}
        <div className="flex items-center gap-3 border-b bg-[#075E54] px-4 py-3">
          <div className="relative size-10 overflow-hidden rounded-full border-2 border-white/20 bg-white">
            <Image
              src="/logo-emoji.png"
              alt="Stroby"
              width={40}
              height={40}
              className="size-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Stroby</p>
            <p className="text-xs text-white/70">online</p>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex min-h-[360px] flex-col gap-2 bg-[#ECE5DD] p-4 dark:bg-[#0b141a]">
          {visibleFrames.map((frame, i) => (
            <div
              key={i}
              className={`flex animate-fade-in ${frame.role === "stroby" ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  frame.role === "stroby"
                    ? "rounded-tl-sm bg-white text-gray-900 dark:bg-[#202c33] dark:text-gray-100"
                    : "rounded-tr-sm bg-[#DCF8C6] text-gray-900 dark:bg-[#005c4b] dark:text-gray-100"
                }`}
              >
                {frame.content}
              </div>
            </div>
          ))}

          {/* Typing indicator when Stroby is about to send */}
          {visibleFrames.length < FRAMES.length &&
            FRAMES[visibleFrames.length] &&
            FRAMES[visibleFrames.length].role === "stroby" &&
            FRAMES[visibleFrames.length].enterAt - elapsed < 0.8 && (
              <div className="flex justify-start">
                <div className="flex gap-1 rounded-2xl rounded-tl-sm bg-white px-3 py-2.5 shadow-sm dark:bg-[#202c33]">
                  <span className="size-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "0ms" }} />
                  <span className="size-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "150ms" }} />
                  <span className="size-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-100 ease-linear"
          style={{ width: `${(elapsed / LOOP_DURATION) * 100}%` }}
        />
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">How Stroby works in 20 seconds</p>
    </div>
  );
}

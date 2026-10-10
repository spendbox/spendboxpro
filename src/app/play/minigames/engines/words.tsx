"use client";

import { useEffect, useState } from "react";
import { Delete, LoaderCircle, Send, Shuffle } from "lucide-react";
import { cn } from "@/lib/cn";
import { playSfx } from "../../sound";
import { makeRng, shuffle } from "../rng";
import { useFinish } from "../stage";
import type { EngineProps } from "../types";

// Word Tiles: seven letter tiles (always from a real 7-letter word, so there's a big word to
// find). Tap tiles to spell a word and send it. Letters are worth Scrabble points; 5, 6 and 7
// letter words get bonuses. Each word counts once. 90 seconds. Same tiles for everyone in a
// challenge. Word list: SCOWL (see public/minigames/WORDS-LICENSE.txt).

const VALUE: Record<string, number> = { a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5, l: 1, m: 3, n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4, w: 4, x: 8, y: 4, z: 10 };
const BONUS: Record<number, number> = { 5: 5, 6: 10, 7: 30 };

let dict: Promise<{ words: Set<string>; bases: string[] }> | null = null;
function loadWords() {
  if (!dict) {
    dict = Promise.all([fetch("/minigames/words.txt").then((r) => r.text()), fetch("/minigames/base-words.txt").then((r) => r.text())]).then(([w, b]) => ({
      words: new Set(w.split("\n").filter(Boolean)),
      bases: b.split("\n").filter(Boolean),
    }));
    dict.catch(() => {
      dict = null;
    });
  }
  return dict;
}

export const wordScore = (w: string) => [...w].reduce((t, ch) => t + (VALUE[ch] ?? 0), 0) + (BONUS[w.length] ?? 0);

export default function Words({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const seconds = Number(cfg.seconds ?? 90);
  const [data, setData] = useState<{ words: Set<string>; tiles: string[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [found, setFound] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(seconds);
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    loadWords()
      .then(({ words, bases }) => {
        if (!live) return;
        const r = makeRng(seed);
        const base = bases[Math.floor(r() * bases.length)] ?? "players";
        setData({ words, tiles: shuffle(r, [...base]) });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [seed]);
  useEffect(() => {
    if (!data) return;
    const id = window.setInterval(() => setLeft((l) => l - 1), 1000);
    return () => window.clearInterval(id);
  }, [data]);
  useEffect(() => {
    if (left <= 0) finish(score);
  }, [left, score, finish]);

  if (failed) return <p className="rounded-2xl bg-panel-2 p-4 text-sm">Couldn&apos;t load the word list. Check your connection and try again.</p>;
  if (!data) {
    return (
      <div className="grid place-items-center py-16 text-muted">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );
  }

  const word = picked.map((i) => data.tiles[i]).join("");
  function send() {
    if (!data || word.length < 3) return setNote({ text: "Words need 3 letters or more", good: false });
    if (found.includes(word)) return setNote({ text: `You already have "${word}"`, good: false });
    if (!data.words.has(word)) {
      playSfx("denied");
      setPicked([]);
      return setNote({ text: `"${word}" isn't in the dictionary`, good: false });
    }
    const pts = wordScore(word);
    setScore((s) => s + pts);
    setFound((f) => [word, ...f]);
    setPicked([]);
    setNote({ text: word.length === 7 ? `ALL SEVEN! +${pts}` : `+${pts}`, good: true });
    playSfx(word.length >= 6 ? "levelup" : "chime");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-2 text-sm font-bold text-white">
        <span>{score} pts</span>
        <span>{found.length} words</span>
        <span className={cn("tabular-nums", left <= 10 && "text-[#ff6b6b]")}>{Math.max(0, left)}s</span>
      </div>
      <div className="flex min-h-14 items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line p-2">
        {picked.map((i, k) => (
          <button key={k} onClick={() => setPicked(picked.slice(0, k))} className="act-pop grid size-10 place-items-center rounded-lg bg-[#fff3bf] font-display text-xl font-bold uppercase shadow">
            {data.tiles[i]}
          </button>
        ))}
        {!picked.length && <span className="text-sm text-muted">Tap the tiles to spell a word</span>}
      </div>
      <div className="flex justify-center gap-1.5">
        {data.tiles.map((ch, i) => {
          const used = picked.includes(i);
          return (
            <button
              key={i}
              disabled={used}
              onClick={() => {
                playSfx("tick");
                setPicked([...picked, i]);
              }}
              className={cn("relative grid size-11 place-items-center rounded-xl bg-[#f8e7b0] font-display text-2xl font-bold uppercase shadow-[0_3px_0_#c9a227] transition", used && "translate-y-1 opacity-30 shadow-none")}
            >
              {ch}
              <span className="absolute bottom-0.5 right-1 text-[9px] font-semibold">{VALUE[ch]}</span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => setPicked(picked.slice(0, -1))} className="flex items-center justify-center gap-1 rounded-2xl bg-panel-2 py-2.5 text-sm font-semibold">
          <Delete className="size-4" /> Back
        </button>
        <button onClick={() => {
            setData({ ...data, tiles: shuffle(makeRng(Math.floor(left * 977 + found.length)), data.tiles) });
            setPicked([]);
          }} className="flex items-center justify-center gap-1 rounded-2xl bg-panel-2 py-2.5 text-sm font-semibold">
          <Shuffle className="size-4" /> Mix
        </button>
        <button onClick={send} className="flex items-center justify-center gap-1 rounded-2xl bg-me py-2.5 text-sm font-bold text-white">
          <Send className="size-4" /> Send
        </button>
      </div>
      <p className={cn("h-5 text-center text-sm font-semibold", note?.good ? "text-me" : "text-hit")}>{note?.text}</p>
      <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
        {found.map((w) => (
          <span key={w} className="rounded-full bg-panel-2 px-2 py-0.5 text-xs font-semibold">
            {w} <span className="text-muted">{wordScore(w)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

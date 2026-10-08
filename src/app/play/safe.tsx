"use client";

import { Component, type ReactNode } from "react";

/**
 * Keeps one part of the screen from taking the whole game down: if something inside it breaks
 * (a phone's graphics hiccup, a dropped connection mid-update), only that part is swapped for
 * `fallback` and quietly tried again a moment later, waiting a little longer each time.
 */
export class Safe extends Component<{ name: string; children: ReactNode; fallback?: ReactNode }, { failed: boolean; tries: number }> {
  state = { failed: false, tries: 0 };
  private timer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`${this.props.name} failed`, error);
    const wait = Math.min(30_000, 2000 * 2 ** this.state.tries);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.setState((s) => ({ failed: false, tries: s.tries + 1 })), wait);
  }

  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer);
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}

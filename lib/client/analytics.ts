"use client";

import type { AnalyticsEventInput } from "@/lib/validation";

const FLOW_KEY = "ti:flow";
const FLOW_TTL = 24 * 60 * 60 * 1000;

function getFlowId(): string {
  try {
    const saved = sessionStorage.getItem(FLOW_KEY);
    if (saved) {
      const value = JSON.parse(saved) as { id?: string; at?: number };
      if (value.id && value.at && Date.now() - value.at < FLOW_TTL) return value.id;
    }
    const id = crypto.randomUUID();
    sessionStorage.setItem(FLOW_KEY, JSON.stringify({ id, at: Date.now() }));
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function trackEvent(event: Omit<AnalyticsEventInput, "eventId" | "flowId">): void {
  const payload: AnalyticsEventInput = { ...event, eventId: crypto.randomUUID(), flowId: getFlowId() };
  void fetch("/api/events", {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined);
}

export function getFlowStartedAt(): number {
  try {
    const stored = sessionStorage.getItem("ti:started-at");
    const now = Date.now();
    const startedAt = Number(stored);
    if (stored && Number.isFinite(startedAt) && now - startedAt < FLOW_TTL) return startedAt;
    sessionStorage.setItem("ti:started-at", String(now));
    return now;
  } catch {
    return Date.now();
  }
}

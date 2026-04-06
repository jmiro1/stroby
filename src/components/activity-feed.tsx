"use client";

import { useEffect, useState } from "react";
import { Sparkles, Users, Zap, Handshake, CheckCircle } from "lucide-react";

interface ActivityEvent {
  type: "creator_joined" | "brand_joined" | "match_suggested" | "introduction_made" | "deal_completed";
  niche: string;
  timestamp: string;
}

const TYPE_CONFIG: Record<ActivityEvent["type"], { icon: React.ElementType; label: string; color: string }> = {
  creator_joined: { icon: Users, label: "A new creator joined", color: "text-blue-500" },
  brand_joined: { icon: Sparkles, label: "A new brand joined", color: "text-purple-500" },
  match_suggested: { icon: Zap, label: "A match was suggested", color: "text-yellow-500" },
  introduction_made: { icon: Handshake, label: "An introduction was made", color: "text-green-500" },
  deal_completed: { icon: CheckCircle, label: "A deal was completed", color: "text-emerald-600" },
};

function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadEvents() {
    try {
      const res = await fetch("/api/activity");
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch {
      // silent
    }
    setLoading(false);
  }

  useEffect(() => {
    loadEvents();
    const interval = setInterval(loadEvents, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="text-center text-sm text-muted-foreground">Loading activity...</div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground">
        No recent activity. Check back soon.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex size-2 rounded-full bg-green-500"></span>
          </span>
          <span className="text-xs font-medium text-muted-foreground">Live</span>
        </div>
        <span className="text-xs text-muted-foreground">Updates every 30s</span>
      </div>

      <ul className="space-y-2">
        {events.map((event, i) => {
          const config = TYPE_CONFIG[event.type];
          const Icon = config.icon;
          return (
            <li
              key={`${event.timestamp}-${i}`}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card/50 p-3 text-sm transition-colors hover:bg-card"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Icon className={`size-4 shrink-0 ${config.color}`} />
                <div className="min-w-0">
                  <p className="truncate font-medium">{config.label}</p>
                  <p className="text-xs text-muted-foreground">in {event.niche}</p>
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {relativeTime(event.timestamp)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

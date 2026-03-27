"use client";
import type { ComponentProps } from "react";
import { AgentFeed } from "@/components/AgentFeed";

// Track E adds maxEntries to AgentFeedProps; cast here so Track C compiles
// independently while remaining forward-compatible once Track E is merged.
type AgentFeedExtended = (
  props: ComponentProps<typeof AgentFeed> & { maxEntries?: number }
) => React.ReactNode;

const AgentFeedWithMax = AgentFeed as unknown as AgentFeedExtended;

interface HomepageFeedProps {
  apiUrl: string;
}

export function HomepageFeed({ apiUrl }: HomepageFeedProps) {
  return (
    <section aria-labelledby="homepage-feed-heading">
      <div className="section-header">
        <h2 id="homepage-feed-heading" className="section-title">
          Live agent activity
        </h2>
      </div>
      <AgentFeedWithMax apiUrl={apiUrl} maxEntries={8} />
    </section>
  );
}

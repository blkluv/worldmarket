"use client";
import dynamic from "next/dynamic";

// @xmtp/browser-sdk accesses localStorage at module init — must stay client-only
const AgentChat = dynamic(
  () => import("@/components/AgentChat").then((m) => m.AgentChat),
  { ssr: false, loading: () => <p className="font-mono" style={{ padding: "2rem", opacity: 0.5 }}>Loading feed…</p> }
);

export function AgentChatClient({ groupId, agentAddress }: { groupId: string; agentAddress?: string }) {
  return <AgentChat groupId={groupId} agentAddress={agentAddress} />;
}

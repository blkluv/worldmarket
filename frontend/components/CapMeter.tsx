"use client";

interface CapMeterProps {
  exposure: string;
  cap: string;
  label?: string;
}

export function CapMeter({ exposure, cap, label }: CapMeterProps) {
  const exposureNum = Number(BigInt(exposure || "0")) / 1_000_000;
  const capNum = Number(BigInt(cap || "1")) / 1_000_000;
  const pct = capNum > 0 ? Math.min((exposureNum / capNum) * 100, 100) : 0;
  const isNearFull = pct > 80;

  return (
    <div>
      {label && (
        <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>{label}</div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.875rem",
          marginBottom: "0.25rem",
          fontWeight: "500",
        }}
      >
        <span style={{ color: isNearFull ? "#dc2626" : "#374151" }}>
          ${exposureNum.toFixed(2)}
        </span>
        <span style={{ color: "#6b7280" }}>${capNum.toFixed(2)} cap</span>
      </div>
      <div
        style={{
          width: "100%",
          height: "0.75rem",
          background: "#e5e7eb",
          borderRadius: "9999px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: isNearFull ? "#dc2626" : "#2563eb",
            borderRadius: "9999px",
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <div style={{ fontSize: "0.75rem", color: isNearFull ? "#dc2626" : "#6b7280", marginTop: "0.25rem" }}>
        {pct.toFixed(1)}% of cap used{isNearFull ? " ⚠️" : ""}
      </div>
    </div>
  );
}

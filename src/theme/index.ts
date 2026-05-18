export const colors = {
  bg: "#FFF7E6",
  surface: "#FFFFFF",
  primary: "#F97316",
  primaryDark: "#C2410C",
  accent: "#2563EB",
  success: "#16A34A",
  danger: "#DC2626",
  text: "#1F2937",
  muted: "#6B7280",
  border: "#FDE68A",
  tapBg: "#FEF3C7",
  tapActive: "#FBBF24",
};

export const spacing = (n: number): number => n * 8;

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const type = {
  display: { fontSize: 48, fontWeight: "800" as const, color: colors.text },
  hugeLetter: { fontSize: 140, fontWeight: "800" as const, color: colors.primaryDark },
  hugeNumber: { fontSize: 140, fontWeight: "800" as const, color: colors.accent },
  h1: { fontSize: 28, fontWeight: "700" as const, color: colors.text },
  h2: { fontSize: 22, fontWeight: "700" as const, color: colors.text },
  body: { fontSize: 18, color: colors.text },
  caption: { fontSize: 14, color: colors.muted },
};

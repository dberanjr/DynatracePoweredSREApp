import React from "react";

interface Props {
  width?: number | string;
  height: number;
  borderRadius?: number;
  dark?: boolean;
  style?: React.CSSProperties;
}

/**
 * A pulsing placeholder rectangle sized to match its eventual real content
 * (row height, bar count, etc.) so a loading section occupies the same
 * space its loaded content will — the page shouldn't visibly reflow once
 * data arrives. `dark` swaps the fill for use on the navy MaturitySpine card.
 */
export const SkeletonBar = ({ width, height, borderRadius = 3, dark, style }: Props) => (
  <div
    style={{
      width,
      height,
      borderRadius,
      background: dark ? "rgba(255,255,255,0.10)" : "var(--panel, #EDEFF3)",
      animation: "sreSkeletonPulse 1.4s ease-in-out infinite",
      flexShrink: 0,
      ...style,
    }}
  />
);

/** Mount once per page that uses SkeletonBar — see ScorecardsPage.tsx. */
export const SkeletonKeyframes = () => (
  <style>{`@keyframes sreSkeletonPulse { 0%, 100% { opacity: .5; } 50% { opacity: 1; } }`}</style>
);

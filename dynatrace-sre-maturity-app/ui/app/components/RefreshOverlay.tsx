import React from "react";

/** Subtle overlay that dims content and shows a thin animated bar when refreshing */
export const RefreshOverlay = ({ isRefreshing, children }: { isRefreshing: boolean; children: React.ReactNode }) => {
  return (
    <div style={{ position: "relative", transition: "opacity 0.3s ease" }}>
      <div style={{
        opacity: isRefreshing ? 0.5 : 1,
        transition: "opacity 0.3s ease",
      }}>
        {children}
      </div>
      {isRefreshing && (
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0, height: 3,
          overflow: "hidden",
          borderRadius: "3px 3px 0 0",
          zIndex: 10,
        }}>
          <div style={{
            width: "40%",
            height: "100%",
            background: "linear-gradient(90deg, transparent, #3BACF0, transparent)",
            animation: "refreshSlide 1.2s ease-in-out infinite",
          }} />
          <style>{`
            @keyframes refreshSlide {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(350%); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
};

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  toggleTheme: () => {},
  isDark: false,
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("dt-sre-theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("dt-sre-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === "dark" }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const ThemeToggleButton = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      style={{
        background: theme === "light" ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.1)",
        border: "1px solid " + (theme === "light" ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.15)"),
        borderRadius: 20,
        padding: "6px 12px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        color: theme === "light" ? "#1A2440" : "#fff",
        fontWeight: 600,
        transition: "all 0.2s",
      }}
    >
      <span style={{ fontSize: 16 }}>{theme === "light" ? "\u2600\ufe0f" : "\ud83c\udf19"}</span>
      {theme === "light" ? "Light" : "Dark"}
    </button>
  );
};

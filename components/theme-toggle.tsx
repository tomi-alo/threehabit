"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
  window.dispatchEvent(new Event("theme-change"));
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("theme-change", onStoreChange);
  return () => window.removeEventListener("theme-change", onStoreChange);
}

function themeFromDocument(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, themeFromDocument, () => "light" as Theme);

  function toggle() {
    applyTheme(theme === "dark" ? "light" : "dark");
  }

  const nextLabel = theme === "dark" ? "Light" : "Dark";

  return (
    <button type="button" className="theme" onClick={toggle} aria-pressed={theme === "dark"}>
      {nextLabel}
    </button>
  );
}

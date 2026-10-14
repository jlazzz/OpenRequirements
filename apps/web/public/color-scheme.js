// Applies the saved light or dark choice before the first paint, so a dark page never flashes white.
// Mantine keeps the choice under this key; "auto" or nothing follows the system.
// A file rather than an inline script, so the Content-Security-Policy can forbid inline scripts.
try {
  const saved = localStorage.getItem("mantine-color-scheme-value");
  const system = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.setAttribute(
    "data-mantine-color-scheme",
    saved === "light" || saved === "dark" ? saved : system,
  );
} catch {}

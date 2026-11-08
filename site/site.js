// Theme toggle (auto → opposite of system → back to auto). The only script on the site.
(() => {
  const root = document.documentElement;
  const KEY = "theme";
  const sysDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
  const read = () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  };
  const apply = (t) => {
    root.dataset.theme = t || "auto";
    const dark = t ? t === "dark" : sysDark();
    for (const b of document.querySelectorAll(".theme")) b.setAttribute("aria-pressed", String(dark));
  };
  apply(read());
  addEventListener("DOMContentLoaded", () => {
    apply(read());
    for (const b of document.querySelectorAll(".theme"))
      b.addEventListener("click", () => {
        const dark = root.dataset.theme === "auto" ? sysDark() : root.dataset.theme === "dark";
        const next = dark ? "light" : "dark";
        try {
          localStorage.setItem(KEY, next);
        } catch {}
        apply(next);
      });
  });
})();

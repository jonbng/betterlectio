(() => {
  if (window.__IL_USERJOT_BOOTSTRAPPED__) return;
  window.__IL_USERJOT_BOOTSTRAPPED__ = true;

  const el = document.getElementById("il-userjot-bootstrap");
  if (!el) return;

  const projectId = el.dataset.projectId;
  const sdkUrl = el.dataset.sdkUrl;
  const theme = el.dataset.theme;
  const identifyEvent = el.dataset.identifyEvent;
  const setThemeEvent = el.dataset.setThemeEvent;

  window.$ujq = window.$ujq || [];
  window.uj =
    window.uj ||
    new Proxy(
      {},
      {
        get: (_, method) =>
          (...args) =>
            window.$ujq.push([method, ...args]),
      },
    );

  if (!document.getElementById("il-userjot-loader")) {
    const sdk = document.createElement("script");
    sdk.id = "il-userjot-loader";
    sdk.src = sdkUrl;
    sdk.type = "module";
    sdk.async = true;
    document.head.appendChild(sdk);
  }

  window.uj.init(projectId, {
    widget: true,
    position: "right",
    theme: theme,
  });

  window.addEventListener(identifyEvent, (event) => {
    const payload = event?.detail;
    if (!payload || typeof payload.id !== "string" || !payload.id.trim()) {
      return;
    }
    window.uj.identify(payload);
  });

  window.addEventListener(setThemeEvent, (event) => {
    const nextTheme = event?.detail;
    if (nextTheme !== "light" && nextTheme !== "dark") {
      return;
    }
    if (typeof window.uj?.setTheme === "function") {
      window.uj.setTheme(nextTheme);
      return;
    }
    window.uj.init(projectId, {
      widget: true,
      position: "right",
      theme: nextTheme,
    });
  });
})();

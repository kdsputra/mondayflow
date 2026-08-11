type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferredInstall: InstallPromptEvent | null = null;

export function registerPwa() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => undefined));
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstall = event as InstallPromptEvent;
    window.dispatchEvent(new CustomEvent("mondayflow:pwa-install"));
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    window.dispatchEvent(new CustomEvent("mondayflow:pwa-install"));
  });
}

export function canInstallPwa() { return Boolean(deferredInstall); }

export async function installPwa() {
  if (!deferredInstall) return false;
  await deferredInstall.prompt();
  const result = await deferredInstall.userChoice;
  if (result.outcome === "accepted") deferredInstall = null;
  window.dispatchEvent(new CustomEvent("mondayflow:pwa-install"));
  return result.outcome === "accepted";
}

export function isStandalonePwa() { return window.matchMedia("(display-mode: standalone)").matches; }

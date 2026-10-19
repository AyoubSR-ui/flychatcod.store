// Tracks whether this tab has made at least one client-side (wouter) route
// change since the app booted — the thing "is there in-app history to go
// back to?" actually needs to know, which plain window.history.length can't
// answer (it also counts entries from before this SPA ever loaded, e.g. the
// page the user arrived from). Wired up once in App.tsx's <Router/>.
//
// A plain module-level counter is enough: this is a single SPA session with
// no server-side rendering, so it naturally resets on a real page reload —
// exactly when "go back" should also stop trusting stale history anyway.
let inAppNavigationCount = 0;

export function recordInAppNavigation(): void {
  inAppNavigationCount++;
}

// True once the user has navigated at least once within the app — meaning
// the previous history entry is guaranteed to be one of ours, so
// window.history.back() is safe. False on a fresh load (direct URL, deep
// link, bookmark) where going back would leave the app entirely.
export function hasInAppHistory(): boolean {
  return inAppNavigationCount > 0;
}

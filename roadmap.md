# Roadmap: Base Mini App Wallet Connection

This document summarizes the recommended wallet connection flow for Farcaster Mini Apps (Base MiniKit ecosystem) and how we will implement it in Trivio. The primary goals are:
- Use the official Mini App SDK methods to obtain the user’s wallet and profile.
- Avoid non-standard fallbacks (like reading address via URL params).
- Provide a clear, reliable UX inside Warpcast and sensible behavior on the open web.

## 1) Official/Recommended Flow (Summary)

The Base Mini App environment (Warpcast) exposes wallet and user identity through the Mini App bridge. The recommended sequence is:

1. Detect Mini App environment and wait for readiness
   - Import the SDK and call `ready()` before performing wallet/user operations so the bridge is fully initialized.
   - Environment detection: prefer SDK’s environment check (e.g. `isMiniApp()`), not just user agent.

2. Get pre-connected wallet
   - Call `getWallet()` (or equivalent) to retrieve the currently selected wallet if one is already connected in the Mini App session.
   - If a wallet is returned, save it to app state and display connected UI immediately without prompting the user.

3. Prompt connection only when needed
   - If `getWallet()` returns empty, show a "Connect" button.
   - On user action, call `wallet.connect()` (or equivalent) to prompt selection. Avoid auto-invoking connection calls without a user gesture unless docs explicitly allow it.

4. Fetch and show user profile (optional but recommended)
   - Call `user.getUser()` (or equivalent) to obtain Farcaster username/handle (and fid) to display a friendly identity instead of raw addresses.

5. Handle updates via events/messages
   - Some environments send updates via `postMessage` or SDK events after the app is ready. Listen for those to update state when wallet/user changes.

6. Non-Mini App web fallback
   - For browsers outside Warpcast, fall back to standard EIP-1193 (e.g., MetaMask) with network switching to Base (chainId 8453) when the user clicks Connect.

Notes:
- "Disconnect" in a Mini App often just means clearing local app state; the Mini App may retain its own session. Implement a graceful local disconnect, and if the SDK adds a real `disconnect()`, adopt it.
- Avoid reliance on URL parameters for wallet identity in production. It’s not the recommended flow and can confuse users.

## 2) Our Implementation Plan

We will strictly follow the above model. High-level steps:

A. Initialization (on mount)
- Import `@farcaster/miniapp-sdk` and call `ready()`.
- Check Mini App environment with SDK (`isMiniApp()` or equivalent) rather than just user agent.
- If Mini App: try `getWallet()`; if present, set connected state immediately.
- Then try `user.getUser()` to fetch username/handle + fid; enrich UI.
- Add a listener for `message` events or SDK-provided events as a backup to capture wallet updates.

B. Connect button behavior
- Only show the Connect button when not connected.
- In Mini App, clicking the button calls `wallet.connect()` (or an equivalent method the SDK exposes).
- On the open web (non-Mini App), use EIP-1193 (`ethereum.request({ method: 'eth_requestAccounts' })`) with chain switching to Base (8453).

C. Display name & UX
- Prefer displaying Farcaster username if available; otherwise show a short address.
- Keep a small badge-style display in the HUD and a richer state in the wallet button component.

D. Remove non-standard fallbacks
- Remove the URL-based parsing (query/hash) of `address`, `username`, and `fid`. Do not set wallet state from the URL.
- Remove pseudo wallet/debug remnants.

E. Errors & logging
- Fail gracefully with minimal console noise in production. If Mini App calls fail, keep the UI in a not-connected state and allow user to try again.

## 3) Concrete Tasks (Trivio)

1) Remove URL fallback from the wallet hook
- File: `app/hooks/useWallet.ts`
- Delete the block that reads wallet address/username from `window.location.search` or `window.location.hash` and persists to `localStorage`.

2) Verify Mini App connection flow
- Ensure we call `ready()` and then `getWallet()`; if present, set state without user action.
- On Connect button click, call `wallet.connect()` and handle the result.
- Fetch `user.getUser()` to get Farcaster username and fid. Persist username for display; do not rely on URL.

3) Keep web fallback (MetaMask/EIP-1193)
- Continue to support desktop/browser users with MetaMask and network switching to Base 8453.

4) UI checks
- `WalletBadge` and `WalletButton` should show username when available; otherwise short address. Hide Connect UI when connected.

5) Test in Warpcast
- Open app as a Farcaster Mini App (Warpcast). Confirm that:
  - On initial load, if a wallet is already selected, `getWallet()` provides it and UI shows connected state without a prompt.
  - If not, Connect button triggers `wallet.connect()` and updates UI after selection.

## 4) Validation Checklist

- [ ] No URL parameter parsing for wallet identity anywhere in the app.
- [ ] Mini App: `ready()` awaited before any wallet/user calls.
- [ ] Mini App: `getWallet()` used for pre-connected session.
- [ ] Mini App: `wallet.connect()` only on user action (button click).
- [ ] Mini App: `user.getUser()` used to surface username/handle (display in UI).
- [ ] Web fallback: EIP-1193 flow switches to Base and connects accounts.
- [ ] UI shows username when available; otherwise short address.
- [ ] Minimal console noise; any errors displayed as safe, user-friendly states.

## 5) Future Improvements

- Add a small status indicator showing whether the app is running in Mini App vs Web mode (to assist debugging).
- Add retry buttons for connection/profile fetch with subtle toasts instead of alerts.
- Consider a lightweight telemetry event when connect succeeds/fails (redacted, privacy-safe) to monitor real-world reliability.

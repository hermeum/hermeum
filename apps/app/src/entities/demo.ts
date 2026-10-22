// Single source of truth for the demo-mode identity, shared by the server
// (which synthesizes this user when sign-in is disabled) and the client (which
// renders it in the sidebar) so the two can't drift.
export const demoUser = {
  id: "demo-user",
  email: "demo@hermeum.local",
  name: "Demo",
} as const;

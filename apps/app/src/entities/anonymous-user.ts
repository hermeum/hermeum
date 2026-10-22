// Single source of truth for the anonymous-user identity, shared by the server
// (which synthesizes this user when auth is disabled) and the client (which
// renders it in the sidebar) so the two can't drift.
export const anonymousUser = {
  id: "anonymous-user",
  email: "anonymous@hermeum.local",
  name: "Anonymous",
} as const;

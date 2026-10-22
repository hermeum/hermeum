/// <reference types="vite/client" />

interface Window {
  // Injected into the served HTML by the server (see server/libs/config
  // authDisabled); true when auth is disabled and every visitor is the shared
  // anonymous user.
  __HERMEUM_AUTH_DISABLED__?: boolean;
}

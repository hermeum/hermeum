/// <reference types="vite/client" />

interface Window {
  // Injected into the served HTML by the server (see server/libs/config
  // demoMode); true when sign-in is disabled and every visitor is the shared
  // demo user.
  __HERMEUM_DEMO__?: boolean;
}

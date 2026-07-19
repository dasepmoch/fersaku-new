export type { FrontendSession } from "./contracts";
export {
  createMockSession,
  hasPermission,
  toFrontendSession,
} from "./contracts";

export type {
  AppSurface,
  ImpersonationMeta,
  SessionClaims,
  SessionSnapshot,
  SessionStatus,
  SessionSurface,
} from "./session-model";
export {
  ANONYMOUS_SNAPSHOT,
  LOADING_SNAPSHOT,
  claimsCacheIdentity,
  createMockClaims,
  isMfaPendingClaims,
  mapAuthSessionToClaims,
  normalizeSessionSurface,
  statusFromClaims,
} from "./session-model";

export {
  AUTH_ENTRY_PATHS,
  buildLoginHref,
  homePathForSurface,
  isAuthEntryPath,
  isPrivateSurfacePath,
  isSafeReturnTo,
  loginPathForSurface,
  resolvePostLoginPath,
  sanitizeReturnTo,
  sanitizeReturnToForSurface,
  surfaceFromPathname,
  surfacePrefix,
} from "./return-to";

export {
  decideRouteGuard,
  sessionHasPermission,
  type GuardDecision,
  type GuardInput,
} from "./guards";

export {
  clearPrivateQueryCache,
  clearSecretLocalSessionState,
  isPrivateQueryKey,
} from "./private-cache";

export {
  applyLoginCsrf,
  fetchSessionBootstrap,
  postLogout,
} from "./session-api";

export {
  __resetSessionStoreForTests,
  applyRemoteLogout,
  bindSessionQueryClient,
  bootstrapSession,
  establishSessionFromBootstrap,
  getSessionSnapshot,
  isSessionReady,
  logoutSession,
  refreshSessionAfterLogin,
  setMockSurfaceHint,
  subscribeSession,
  wireSessionTransportHooks,
} from "./session-store";

export {
  SessionProvider,
  useHasPermission,
  useSession,
  useSessionClaims,
} from "./session-provider";

export { AuthEntryGuard, SessionRouteGuard } from "./route-guard";
export { PrivateSurfaceShell } from "./private-surface-shell";
export { BuyerAccountShell } from "./buyer-account-shell";

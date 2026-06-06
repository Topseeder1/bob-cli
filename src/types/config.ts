export interface BobConfig {
  // Auth
  tier: 'local' | 'platform';
  loggedIn: boolean;
  email: string | null;
  uid: string | null;
  authToken: string | null;
  refreshToken: string | null;

  // AI Provider
  provider: 'claude' | 'gemini' | 'openai' | 'grok' | 'local' | null;
  providerKey: string | null;
  localEndpoint: string | null;

  // Mode
  personalizationMode: boolean;
  consultantMode: boolean;
  autoMode: boolean;

  // IDRP
  idrp: boolean;
  idrpFilter: 'free' | 'none';

  // Session
  activeProject: string | null;
  conversationId: string | null;

  // Persona
  activePersona: string | null;

  // First run
  hasSeenWelcome: boolean;
}

export const DEFAULT_CONFIG: BobConfig = {
  tier: 'local',
  loggedIn: false,
  email: null,
  uid: null,
  authToken: null,
  refreshToken: null,
  provider: null,
  providerKey: null,
  localEndpoint: null,
  personalizationMode: false,
  consultantMode: false,
  autoMode: false,
  idrp: false,
  idrpFilter: 'free',
  activeProject: null,
  conversationId: null,
  activePersona: null,
  hasSeenWelcome: false,
};
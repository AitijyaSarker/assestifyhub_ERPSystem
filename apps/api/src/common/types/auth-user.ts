export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  shopIds: string[];
  sessionId: string;
  actorRole: string;
  deviceInfo: string | null;
  ipAddress: string | null;
};

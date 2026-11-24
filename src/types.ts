export type Role = "user" | "admin";

export type User = {
  id: number;
  username: string;
  role: Role;
  createdAt?: string;
};

export type LinkRecord = {
  id: number;
  title: string;
  url: string;
  description: string;
  department: string;
  category: string;
  color: string;
  thumbnail: { name: string; type: string; dataUrl: string } | null;
  attachment: { name: string; type: string } | null;
};

export type Announcement = {
  id: number;
  title: string;
  body: string;
  color: string;
  category: string;
  createdAt: string;
};

export type SiteSettings = {
  siteName: string;
  headerSubtitle: string;
  heroBadge: string;
  heroTitle: string;
  heroDescription: string;
  announcementsTitle: string;
  linksTitle: string;
  footerText: string;
  logoUrl: string;
  faviconUrl: string;
  showHero: boolean;
  showIntegrations: boolean;
  showAnnouncements: boolean;
  showLinks: boolean;
};

export type MappingValueType = "string" | "number" | "currency" | "percent" | "boolean" | "date" | "unix-seconds" | "url" | "image";
export type MappingOperator = ">" | ">=" | "<" | "<=" | "==" | "!=";
export type MappingCondition = {
  operator: MappingOperator;
  value: number;
  emoji: string;
};

export type IntegrationMapping = {
  label: string;
  path: string;
  valueType: MappingValueType;
  emoji?: string;
  positiveEmoji?: string;
  negativeEmoji?: string;
  zeroEmoji?: string;
  conditionOperator?: MappingOperator;
  conditionValue?: number;
  conditionTrueEmoji?: string;
  conditionFalseEmoji?: string;
  conditionMode?: "AND" | "OR";
  conditions?: MappingCondition[];
};

export type IntegrationConfig = {
  id: number;
  title: string;
  icon: string;
  endpointUrl: string;
  authHeader: string;
  authToken: string;
  authScheme: string;
  isPublic: boolean;
  responsePath: string;
  refreshMinutes: number;
  mappings: IntegrationMapping[];
};

export type IntegrationData = {
  id: number;
  title: string;
  icon: string;
  fetchedAt?: string;
  fields?: Array<{
    label: string;
    rawValue: unknown;
    displayValue: string;
    emoji: string;
    valueType: MappingValueType;
  }>;
  error?: string;
};

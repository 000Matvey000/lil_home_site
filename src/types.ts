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
  /** Brand logo key (see src/lib/brands.tsx), or "" for none. */
  linkType: string;
  /** Served from /api/links/:id/thumbnail?v=... so browsers can cache it. */
  thumbnail: { name: string; type: string; url: string } | null;
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
  announcementsTitle: string;
  linksTitle: string;
  photosTitle: string;
  footerText: string;
  bannerTitle: string;
  bannerSubtitle: string;
  /** Google Fonts family name, or "" for the system font. */
  fontFamily: string;
  photoIntervalSeconds: number;
  logoUrl: string;
  faviconUrl: string;
  bannerUrl: string;
  showHero: boolean;
  showPhotos: boolean;
  showIntegrations: boolean;
  showAnnouncements: boolean;
  showLinks: boolean;
  /** Position of each home section; lower numbers appear higher on the page. */
  orderHero: number;
  orderPhotos: number;
  orderIntegrations: number;
  orderAnnouncements: number;
  orderLinks: number;
};

export type Photo = {
  id: number;
  caption: string;
  sortOrder: number;
  source: "upload" | "url";
  sourceUrl: string;
  imageUrl: string;
};

export type FileValue = { name: string; base64: string };

export type MappingValueType ="string" | "number" | "currency" | "percent" | "boolean" | "date" | "unix-seconds" | "url" | "image";
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
  /** false = only shown to signed-in users. */
  isPublic?: boolean;
};

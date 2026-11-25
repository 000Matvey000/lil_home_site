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

// Integration mapping types mirror server/mapping.ts.
export type MappingValueType = "string" | "number" | "currency" | "percent" | "boolean" | "date" | "unix-seconds" | "url" | "image" | "list";
export type MappingOperator = ">" | ">=" | "<" | "<=" | "==" | "!=";
export type DateStyle = "datetime" | "date" | "time" | "relative";
export type FieldSize = "small" | "normal" | "large";
export type MappingCondition = {
  operator: MappingOperator;
  value: number;
  emoji: string;
};

export type IntegrationMapping = {
  label: string;
  /** a.b[0].c, items[*].title (every item as a list) or ["key with.dots"]. Empty = the whole root. */
  path: string;
  valueType: MappingValueType;
  /** "Middle logic": a JavaScript expression, or a function body using `return`. */
  transform?: string;
  group?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  currency?: string;
  dateStyle?: DateStyle;
  maxLength?: number;
  maxItems?: number;
  size?: FieldSize;
  wide?: boolean;
  hideIfEmpty?: boolean;
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
  /** Client-only React key for the mapping editor; stripped before saving. */
  _key?: string;
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

export type IntegrationField = {
  /** Index of the mapping that produced this field. */
  index: number;
  label: string;
  rawValue: unknown;
  displayValue: string;
  /** Untruncated text when maxLength shortened displayValue. */
  fullValue?: string;
  emoji: string;
  valueType: MappingValueType;
  group?: string;
  size?: FieldSize;
  wide?: boolean;
  /** Empty and set to hide when empty: skipped on the card. */
  hidden?: boolean;
  items?: string[];
  /** Dates are formatted in the browser so they use the viewer's timezone. */
  isoValue?: string;
  /** A date field whose value is a list: one ISO string per entry (or the text, if it isn't a date). */
  isoItems?: string[];
  dateStyle?: DateStyle;
  prefix?: string;
  suffix?: string;
  /** The field's logic failed. */
  error?: string;
};

export type IntegrationData = {
  id: number;
  title: string;
  icon: string;
  fetchedAt?: string;
  fields?: IntegrationField[];
  error?: string;
  /** false = only shown to signed-in users. */
  isPublic?: boolean;
};

import type { Announcement, FileValue, IntegrationConfig, IntegrationData, LinkRecord, Photo, Role, SiteSettings, User } from "./types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(body.error || "Request failed");
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export type AssetKey = "logo" | "favicon" | "banner";
export type PhotoInput = { caption: string; url?: string; file?: FileValue };

export const api = {
  me: () => request<{ user: User | null }>("/api/auth/me"),
  login: (username: string, password: string) => request<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  links: () => request<LinkRecord[]>("/api/links"),
  createLink: (value: unknown) => request<LinkRecord>("/api/links", { method: "POST", body: JSON.stringify(value) }),
  updateLink: (id: number, value: unknown) => request<LinkRecord>(`/api/links/${id}`, { method: "PUT", body: JSON.stringify(value) }),
  deleteLink: (id: number) => request<void>(`/api/links/${id}`, { method: "DELETE" }),
  announcements: () => request<Announcement[]>("/api/announcements"),
  createAnnouncement: (value: unknown) => request<Announcement>("/api/announcements", { method: "POST", body: JSON.stringify(value) }),
  updateAnnouncement: (id: number, value: unknown) => request<Announcement>(`/api/announcements/${id}`, { method: "PUT", body: JSON.stringify(value) }),
  deleteAnnouncement: (id: number) => request<void>(`/api/announcements/${id}`, { method: "DELETE" }),
  settings: () => request<SiteSettings>("/api/settings"),
  updateSettings: (value: Partial<SiteSettings>) => request<SiteSettings>("/api/settings", { method: "PUT", body: JSON.stringify(value) }),
  uploadAsset: (key: AssetKey, value: FileValue) => request<void>(`/api/assets/${key}`, { method: "PUT", body: JSON.stringify(value) }),
  deleteAsset: (key: AssetKey) => request<void>(`/api/assets/${key}`, { method: "DELETE" }),
  photos: () => request<Photo[]>("/api/photos"),
  createPhoto: (value: PhotoInput) => request<Photo>("/api/photos", { method: "POST", body: JSON.stringify(value) }),
  updatePhoto: (id: number, value: PhotoInput) => request<Photo>(`/api/photos/${id}`, { method: "PUT", body: JSON.stringify(value) }),
  reorderPhotos: (ids: number[]) => request<Photo[]>("/api/photos/order", { method: "PUT", body: JSON.stringify({ ids }) }),
  deletePhoto: (id: number) => request<void>(`/api/photos/${id}`, { method: "DELETE" }),
  users: () => request<User[]>("/api/users"),
  createUser: (value: { username: string; password: string; role: Role }) => request<User>("/api/users", { method: "POST", body: JSON.stringify(value) }),
  updateUser: (id: number, value: { password?: string; role?: Role }) => request<User>(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(value) }),
  deleteUser: (id: number) => request<void>(`/api/users/${id}`, { method: "DELETE" }),
  integrations: () => request<IntegrationConfig[]>("/api/integrations"),
  createIntegration: (value: unknown) => request<IntegrationConfig>("/api/integrations", { method: "POST", body: JSON.stringify(value) }),
  updateIntegration: (id: number, value: unknown) => request<IntegrationConfig>(`/api/integrations/${id}`, { method: "PUT", body: JSON.stringify(value) }),
  deleteIntegration: (id: number) => request<void>(`/api/integrations/${id}`, { method: "DELETE" }),
  importIntegrations: (value: { mode: "append" | "replace"; integrations: unknown[] }) =>
    request<{ imported: number; skipped: number; problems: string[] }>("/api/integrations/import", { method: "POST", body: JSON.stringify(value) }),
  testIntegration: (value: unknown) =>request<IntegrationData>("/api/integrations/test", { method: "POST", body: JSON.stringify(value) }),
  integrationData: () => request<IntegrationData[]>("/api/integrations/data/all"),
};

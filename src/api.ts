import type { Announcement, IntegrationConfig, IntegrationData, LinkRecord, SiteSettings, User } from "./types";

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

export const api = {
  me: () => request<{ user: User }>("/api/auth/me"),
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
  updateSettings: (value: unknown) => request<SiteSettings>("/api/settings", { method: "PUT", body: JSON.stringify(value) }),
  uploadAsset: (key: "logo" | "favicon", value: unknown) => request<void>(`/api/assets/${key}`, { method: "PUT", body: JSON.stringify(value) }),
  users: () => request<User[]>("/api/users"),
  createUser: (value: unknown) => request<User>("/api/users", { method: "POST", body: JSON.stringify(value) }),
  deleteUser: (id: number) => request<void>(`/api/users/${id}`, { method: "DELETE" }),
  integrations: () => request<IntegrationConfig[]>("/api/integrations"),
  createIntegration: (value: unknown) => request<IntegrationConfig>("/api/integrations", { method: "POST", body: JSON.stringify(value) }),
  updateIntegration: (id: number, value: unknown) => request<IntegrationConfig>(`/api/integrations/${id}`, { method: "PUT", body: JSON.stringify(value) }),
  deleteIntegration: (id: number) => request<void>(`/api/integrations/${id}`, { method: "DELETE" }),
  testIntegration: (value: unknown) => request<IntegrationData>("/api/integrations/test", { method: "POST", body: JSON.stringify(value) }),
  integrationData: () => request<IntegrationData[]>("/api/integrations/data/all"),
};

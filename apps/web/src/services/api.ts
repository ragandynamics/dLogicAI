import { API_BASE_URL } from "../types/env";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new ApiError(
      data?.error?.message || response.statusText || "Request failed",
      response.status,
      data?.error?.code,
    );
  }

  return data as T;
}

export const api = {
  me: () => request<any>("/me"),

  register: (body: { name: string; email: string; password: string }) =>
    request<any>("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  login: (body: { email: string; password: string }) =>
    request<any>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  logout: () =>
    request<any>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  plans: () => request<any>("/plans"),

  subscription: () =>
    request<any>("/billing/subscription"),

  changeSubscription: (planId: string) =>
    request<any>("/billing/subscription/change", {
      method: "POST",
      body: JSON.stringify({ plan_id: planId }),
    }),

  cancelSubscription: () =>
    request<any>("/billing/subscription/cancel", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  credits: () =>
    request<any>("/billing/credits"),

  creditLedger: (limit = 100) =>
    request<any>(`/billing/credits/ledger?limit=${limit}`),

  projects: () => request<any>("/projects"),

  createProject: (body: { name: string; environment: string }) =>
    request<any>("/projects", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  apiKeys: (projectId: string) =>
    request<any>(`/projects/${projectId}/api-keys`),

  createApiKey: (projectId: string, name: string) =>
    request<any>(`/projects/${projectId}/api-keys`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  providers: (projectId: string) =>
    request<any>(`/projects/${projectId}/providers`),

  addProvider: (
    projectId: string,
    body: { provider: string; name: string; api_key: string },
  ) =>
    request<any>(`/projects/${projectId}/providers`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  usage: (days = 30) =>
    request<any>(`/usage?days=${days}`),

  conversations: () =>
    request<any>("/conversations"),

  organization: () =>
    request<any>("/organization"),

  updateOrganization: (body: Record<string, unknown>) =>
    request<any>("/organization", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  members: () =>
    request<any>("/organization/members"),

  inviteMember: (body: {
    email: string;
    role: "admin" | "developer" | "viewer" | "billing";
  }) =>
    request<any>("/organization/invitations", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

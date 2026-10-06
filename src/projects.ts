import type { ArtItem } from './types.ts'

export interface Project {
  id: string
  name: string
  createdAt: string
  items: ArtItem[]
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
  return body
}

export async function fetchProjects(): Promise<Project[]> {
  const data = await request<{ projects: Project[] }>('/api/projects')
  return data.projects ?? []
}

export function createProject(name: string): Promise<Project> {
  return request<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ name }) })
}

export function renameProject(id: string, name: string): Promise<Project> {
  return request<Project>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
}

export async function deleteProject(id: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' })
}

export function addToProject(id: string, item: ArtItem): Promise<Project> {
  return request<Project>(`/api/projects/${id}/items`, { method: 'POST', body: JSON.stringify({ item }) })
}

export function removeFromProject(id: string, src: string): Promise<Project> {
  return request<Project>(`/api/projects/${id}/items?src=${encodeURIComponent(src)}`, { method: 'DELETE' })
}

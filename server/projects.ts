import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.ts'
import type { ArtItem } from './types.ts'

export interface Project {
  id: string
  name: string
  createdAt: string
  items: ArtItem[]
}

const FILE = path.join(config.dataDir, 'projects.json')
const MAX_PROJECTS = 60
const MAX_ITEMS = 500
const NAME_MAX = 40

function load(): Project[] {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    return Array.isArray(raw) ? (raw as Project[]) : []
  } catch {
    return []
  }
}

function persist(list: Project[]): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  const tmp = `${FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2))
  fs.renameSync(tmp, FILE) // atomic swap, so a crash can't truncate the file
}

let projects: Project[] = load()
let seq = projects.length

export function listProjects(): Project[] {
  return projects
}

function cleanName(name: unknown): string {
  const text = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
  return text
}

/** Only keep the fields a card needs, and only sane image sources. */
function cleanItem(raw: unknown): ArtItem | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const src = String(r.src ?? '')
  if (!/^(\/images\/|https:\/\/warcraft\.wiki\.gg\/|\/api\/img\?)/.test(src)) return null
  const page = String(r.page ?? '')
  if (!page.startsWith('https://')) return null
  return {
    id: String(r.id ?? src).slice(0, 80),
    title: String(r.title ?? 'Untitled').slice(0, 200),
    artist: r.artist ? String(r.artist).slice(0, 120) : null,
    src: src.slice(0, 2000),
    full: r.full ? String(r.full).slice(0, 2000) : undefined,
    page: page.slice(0, 2000),
    w: Number(r.w) || undefined,
    h: Number(r.h) || undefined,
    origin: r.origin === 'live' ? 'live' : 'index',
  }
}

function find(id: string): Project | undefined {
  return projects.find((p) => p.id === id)
}

export function createProject(name: unknown): Project | { error: string } {
  const clean = cleanName(name)
  if (!clean) return { error: 'A project needs a name.' }
  if (projects.length >= MAX_PROJECTS) return { error: `Limit reached (${MAX_PROJECTS} projects).` }
  seq += 1
  const project: Project = {
    id: `p${Date.now().toString(36)}${seq}`,
    name: clean,
    createdAt: new Date().toISOString(),
    items: [],
  }
  projects = [...projects, project]
  persist(projects)
  return project
}

export function renameProject(id: string, name: unknown): Project | { error: string } {
  const clean = cleanName(name)
  if (!clean) return { error: 'A project needs a name.' }
  const project = find(id)
  if (!project) return { error: 'No such project.' }
  projects = projects.map((p) => (p.id === id ? { ...p, name: clean } : p))
  persist(projects)
  return find(id)!
}

export function deleteProject(id: string): boolean {
  const before = projects.length
  projects = projects.filter((p) => p.id !== id)
  if (projects.length === before) return false
  persist(projects)
  return true
}

export function addItem(id: string, raw: unknown): Project | { error: string } {
  const project = find(id)
  if (!project) return { error: 'No such project.' }
  const item = cleanItem(raw)
  if (!item) return { error: 'That artwork cannot be saved.' }
  if (project.items.some((i) => i.src === item.src)) return project
  if (project.items.length >= MAX_ITEMS) return { error: `Limit reached (${MAX_ITEMS} images).` }
  projects = projects.map((p) => (p.id === id ? { ...p, items: [...p.items, item] } : p))
  persist(projects)
  return find(id)!
}

export function removeItem(id: string, src: string): Project | { error: string } {
  const project = find(id)
  if (!project) return { error: 'No such project.' }
  projects = projects.map((p) => (p.id === id ? { ...p, items: p.items.filter((i) => i.src !== src) } : p))
  persist(projects)
  return find(id)!
}

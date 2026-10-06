import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATALOGUE_ENABLED } from '../shared/features.ts'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const config = {
  /** Mirrors shared/features.ts — see that file for what the flag covers. */
  catalogueEnabled: CATALOGUE_ENABLED,
  port: Number(process.env.PORT ?? 3090),
  host: process.env.HOST ?? '0.0.0.0',
  /** Ollama's OpenAI-compatible endpoint. */
  ollamaUrl: process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434/v1',
  /** Model used for the agent loop. qwen3-14b:latest is a faster, smaller option. */
  model: process.env.AGENT_MODEL ?? 'qwen3.6-27b:latest',
  /** Max tool-calling rounds before the agent must answer. */
  maxSteps: Number(process.env.AGENT_MAX_STEPS ?? 6),
  /** Requests to the wiki must not look like a browser (Cloudflare challenges those). */
  wikiUa: 'wow-art-agent/1.0 (personal fan project; self-hosted)',
  wikiApi: 'https://warcraft.wiki.gg/api.php',
  dataFile: path.join(ROOT, 'src', 'data', 'artworks.json'),
  /** Saved projects live here (not committed — it is user content). */
  dataDir: process.env.DATA_DIR ?? path.join(ROOT, 'data'),
  distDir: path.join(ROOT, 'dist'),
}

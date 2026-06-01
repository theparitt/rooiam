import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.CANDYCLOUD_DB_PATH || join(__dirname, '..', 'candycloud.db')
const db = new Database(dbPath)

db.exec(`
  create table if not exists app_profiles (
    id integer primary key autoincrement,
    rooiam_user_id text not null unique,
    display_name text,
    created_at text not null default (datetime('now')),
    updated_at text not null default (datetime('now'))
  )
`)

export function getProfile(rooiamUserId) {
  return db.prepare('select * from app_profiles where rooiam_user_id = ?').get(rooiamUserId)
}

export function upsertProfile(rooiamUserId, displayName) {
  const existing = getProfile(rooiamUserId)
  if (existing) {
    db.prepare(`
      update app_profiles 
      set display_name = ?, updated_at = datetime('now')
      where rooiam_user_id = ?
    `).run(displayName, rooiamUserId)
    return getProfile(rooiamUserId)
  } else {
    db.prepare(`
      insert into app_profiles (rooiam_user_id, display_name)
      values (?, ?)
    `).run(rooiamUserId, displayName)
    return getProfile(rooiamUserId)
  }
}

export default db
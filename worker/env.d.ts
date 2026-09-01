interface Env {
  DASHBOARD_USERNAME?: string
  DASHBOARD_PASSWORD?: string
  DASHBOARD_SESSION_SECRET?: string
  DB?: D1Database
  MEDIA?: R2Bucket
  ASSETS: Fetcher
  CARDMARKET?: KVNamespace
}

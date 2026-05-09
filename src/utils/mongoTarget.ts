export function getMongoTarget(uri: string): string {
  try {
    const parsed = new URL(uri)
    return parsed.host
  } catch {
    return 'configured MongoDB host'
  }
}

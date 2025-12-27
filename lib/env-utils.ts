/**
 * Environment Variable Utilities
 * ===============================
 * Vercel/Railway env vars often contain literal \n strings
 * that break HTTP headers. This utility cleans them.
 */

/**
 * Sanitize environment variable value
 * Removes literal \n strings and whitespace
 */
export function cleanEnv(value: string | undefined, fallback: string = ''): string {
  return (value || fallback).replace(/\\n/g, '').trim()
}

/**
 * Get clean API key from environment
 */
export function getApiKey(envVar: string, fallback: string = ''): string {
  return cleanEnv(process.env[envVar], fallback)
}

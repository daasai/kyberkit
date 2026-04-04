import * as fs from 'fs/promises';
import { parse as parseYaml } from 'yaml';
import { KyberConfig, KyberConfigSchema } from '../types/config.js';
import { ConfigError } from '../types/errors.js';

/**
 * Loads and validates a KyberKit configuration file from disk.
 * Applies environment variable resolution before validation.
 */
export async function loadConfig(filePath: string): Promise<KyberConfig> {
  const content = await fs.readFile(filePath, 'utf-8').catch(err => {
    throw new ConfigError(`Failed to read config file at "${filePath}": ${err.message}`, err);
  });

  const resolvedContent = resolveEnvVars(content);

  let rawData: unknown;
  try {
    rawData = parseYaml(resolvedContent);
  } catch (err: any) {
    throw new ConfigError(`Malformed YAML in config file "${filePath}": ${err.message}`, err);
  }

  const result = KyberConfigSchema.safeParse(rawData);
  if (!result.success) {
    throw new ConfigError(`Invalid config format in "${filePath}": ${result.error.message}`);
  }

  return result.data;
}

/**
 * Replaces ${VAR_NAME} with the value of process.env.VAR_NAME.
 * Unset variables are left empty.
 */
export function resolveEnvVars(content: string): string {
  return content.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    return process.env[varName] ?? '';
  });
}

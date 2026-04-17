/**
 * Command system types for / commands (e.g., /help, /cost).
 * Sprint 2, Step 6.
 */

import { AssetManifest } from './assets.js';
import { CumulativeUsage } from '../types/agent-events.js';

/** The result of executing a command */
export interface CommandResult {
  /** Text output to display to the user */
  output: string;
  /** Whether the command succeeded */
  success: boolean;
  /** 
   * Whether to continue the LLM conversation loop after this command.
   * Internal commands like /help usually intercept the loop and don't call the LLM.
   */
  continueConversation: boolean;
}

/** Context for command execution */
export interface CommandContext {
  /** Cumulative token usage for the current session */
  cumulative?: CumulativeUsage;
  /** Discovered assets manifest */
  assets?: AssetManifest;
  /** Current working directory */
  cwd: string;
}

/** Interface for an internal slash command */
export interface Command {
  /** The name of the command (e.g., 'help' for /help) */
  readonly name: string;
  /** Short description for the help command */
  readonly description: string;
  /** Optional subcommand names (e.g., ['list', 'clear'] for /memory) */
  readonly subcommands?: string[];
  /** 
   * Parse raw arguments into a record. 
   * If not provided, the raw string is passed as _raw.
   */
  parse?(input: string): Record<string, unknown>;
  /** Core execution logic */
  execute(args: Record<string, unknown>, context: CommandContext): Promise<CommandResult>;
  /** Whether the command is contextually available */
  isEnabled?(context: CommandContext): boolean;
}

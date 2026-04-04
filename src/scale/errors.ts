import { KyberError, ErrorCategory } from '../types/errors.js';

export class ScaleError extends KyberError {
  readonly category: ErrorCategory = 'system';
}

export class ResourceExhaustedError extends ScaleError {
  readonly code = 'RESOURCE_EXHAUSTED_FAULT';
  constructor(public resourceType: 'tokens' | 'time', public used: number, public max: number) {
    super(`Execution trapped: ${resourceType} budget exhausted (${used} / ${max})`);
  }
}

export class UnknownAgentMailboxError extends ScaleError {
  readonly code = 'UNKNOWN_MAILBOX_FAULT';
  constructor(public agentId: string) {
    super(`No receiver subscribed for Agent ID: ${agentId}`);
  }
}

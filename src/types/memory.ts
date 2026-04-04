/**
 * [R1] Memory Taxonomy (CC-Aligned)
 * [C2]: Replaces free-form tags with closed enum categories.
 */
export type MemoryCategory = 
  | 'user'      // Preferences, biography, persistent personal facts
  | 'feedback'  // Past corrections, style preferences from explicit feedback
  | 'project'   // Current repository context, architecture, local rules
  | 'reference' // External documentation snippets, API specs, research;

/**
 * [I1] Structured Memory Template (CC-Aligned)
 * Provides 8 fixed sections for session memory serialization.
 */
export enum MemorySection {
  CURRENT_TASK = 'Current Task',
  USER_PREFERENCES = 'User Preferences',
  PROJECT_CONTEXT = 'Project Context',
  TECHNICAL_CONSTRAINTS = 'Technical Constraints',
  PAST_INTERACTIONS = 'Past Interactions',
  ERRORS_AND_LEARNINGS = 'Errors and Learnings',
  PENDING_QUESTIONS = 'Pending Questions',
  RELIABILITY_STATUS = 'Reliability Status',
}

export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
  score?: number; // For RAG/Ranking
}

export interface MemorySnapshot {
  entries: MemoryEntry[];
  timestamp: number;
}

/** [C1] Flush triggers for SessionMemory. */
export interface MemoryFlushTrigger {
  tokenThreshold: number;      // Flush when buffered tokens > N
  toolCallThreshold: number;   // Flush when tool call count > N
  debounceMs: number;          // Debounce timer for small updates
}

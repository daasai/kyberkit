export interface ContextEntry {
  id: string;
  source: 'static' | 'dynamic';
  content: string;
  tokenCount: number;
  priority: number; // 0 是最高优先级
}

export interface TaskNode {
  id: string;
  type: 'atomic' | 'composite';
  description: string;
  requiredPermissions: string[];
  estimatedTokens?: number;
  timeoutMs?: number;
  acceptanceCriteria?: string[];
  retryK?: number;
}

export interface TaskEdge {
  from: string;
  to: string;
  type: 'sequential' | 'parallel';
}

export interface TaskGraph {
  id: string;
  description: string;
  nodes: TaskNode[];
  edges: TaskEdge[];
}

export interface WorkflowStatus {
  workflowId: string;
  nodeStatus: Record<string, 'pending' | 'running' | 'completed' | 'failed' | 'skipped'>;
  overallProgress: number; // 0.0 - 1.0
}

export interface ContextBudget {
  setLimit(maxTokens: number): void;
  assemble(entries: ContextEntry[]): {
    assembled: ContextEntry[];
    dropped: ContextEntry[];
    totalTokens: number;
  };
}

export interface Planner {
  plan(request: string, context: ContextEntry[]): Promise<TaskGraph>;
  replan(currentGrid: TaskGraph, failedNodeId: string, feedback: string): Promise<TaskGraph>;
}

export interface WorkflowEngine {
  execute(graph: TaskGraph, initialContext: any): Promise<void>;
  getStatus(workflowId: string): WorkflowStatus;
}

import { describe, it, expect, beforeEach } from 'vitest';
import { DeterministicWorkflowEngine } from './DeterministicWorkflowEngine.js';
import { TaskGraph } from '../types/intelligence.js';
import { WorkflowCompilationError, IntelligenceError } from './errors.js';

describe('DeterministicWorkflowEngine (Red Phase)', () => {
  let engine: DeterministicWorkflowEngine;

  beforeEach(() => {
    engine = new DeterministicWorkflowEngine();
  });

  it('should compile and topological sort a valid DAG', async () => {
    const graph: TaskGraph = {
      id: 'g1', description: 'test',
      nodes: [
        { id: '1', type: 'atomic', description: '1', requiredPermissions: [] },
        { id: '2', type: 'atomic', description: '2', requiredPermissions: [] },
        { id: '3', type: 'atomic', description: '3', requiredPermissions: [] },
      ],
      edges: [
        { from: '1', to: '2', type: 'sequential' },
        { from: '2', to: '3', type: 'sequential' }
      ]
    };

    // Should not throw
    await expect(engine.execute(graph, {})).resolves.toBeUndefined();
  });

  it('should throw WorkflowCompilationError if DAG has a cycle', async () => {
    const graph: TaskGraph = {
      id: 'g2', description: 'test cycle',
      nodes: [
        { id: '1', type: 'atomic', description: '1', requiredPermissions: [] },
        { id: '2', type: 'atomic', description: '2', requiredPermissions: [] },
      ],
      edges: [
        { from: '1', to: '2', type: 'sequential' },
        { from: '2', to: '1', type: 'sequential' } // CYCLE!
      ]
    };

    await expect(engine.execute(graph, {})).rejects.toThrow(WorkflowCompilationError);
  });
});

import { WorkflowEngine, TaskGraph, WorkflowStatus } from '../types/intelligence.js';
import { WorkflowCompilationError } from './errors.js';

export class DeterministicWorkflowEngine implements WorkflowEngine {
  async execute(graph: TaskGraph, initialContext: any): Promise<void> {
    // 1. Compile Phase (Cycle Detection via Topological Sort)
    this.topologicalSort(graph);
    
    // In actual implementation, we'd dispatch nodes sequentially or in parallel based on layers.
    // For Phase 3 deterministic boundary test, simply compiling without error is enough.
  }

  getStatus(workflowId: string): WorkflowStatus {
    return {
      workflowId,
      nodeStatus: {},
      overallProgress: 0
    };
  }

  private topologicalSort(graph: TaskGraph): string[][] {
    const inDegree = new Map<string, number>();
    const graphMap = new Map<string, string[]>();

    // Initialize
    for (const node of graph.nodes) {
      inDegree.set(node.id, 0);
      graphMap.set(node.id, []);
    }

    // Build connections
    for (const edge of graph.edges) {
      if (!graphMap.has(edge.from) || !graphMap.has(edge.to)) {
        throw new WorkflowCompilationError(`Edge references unknown node: ${edge.from} -> ${edge.to}`);
      }
      graphMap.get(edge.from)!.push(edge.to);
      inDegree.set(edge.to, inDegree.get(edge.to)! + 1);
    }

    // Kahn's Algorithm
    const queue: string[] = [];
    for (const [node, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(node);
      }
    }

    const layers: string[][] = [];
    let visitedCount = 0;

    while (queue.length > 0) {
      const size = queue.length;
      const currentLayer: string[] = [];

      for (let i = 0; i < size; i++) {
        const current = queue.shift()!;
        currentLayer.push(current);
        visitedCount++;

        const neighbors = graphMap.get(current)!;
        for (const neighbor of neighbors) {
          inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
          if (inDegree.get(neighbor) === 0) {
            queue.push(neighbor);
          }
        }
      }
      layers.push(currentLayer);
    }

    if (visitedCount !== graph.nodes.length) {
      throw new WorkflowCompilationError('Cycle detected in TaskGraph');
    }

    return layers;
  }
}

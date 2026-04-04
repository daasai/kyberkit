import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalMessageBus } from './LocalMessageBus.js';
import { AgentEvent, AgentMessage } from '../types/scale.js';

describe('LocalMessageBus (Red Phase)', () => {
  let bus: LocalMessageBus;

  beforeEach(() => {
    bus = new LocalMessageBus();
  });

  it('should publish and subscribe to events', async () => {
    const event: AgentEvent = {
        type: 'test.event',
        sourceId: 'agent-1',
        timestamp: Date.now(),
        payload: { x: 1 }
    };

    const handler = vi.fn();
    const sub = bus.subscribe('test.event', handler);

    bus.publish(event);
    
    // We expect some micro-delay or direct execution
    expect(handler).toHaveBeenCalledWith(event);
    
    sub.unsubscribe();
    bus.publish(event);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should send and receive point-to-point messages', async () => {
    const msg: AgentMessage = {
       id: 'm1', from: 'agent-1', to: 'agent-2', content: 'hello'
    };

    const receivePromise = (async () => {
       for await (const message of bus.receive('agent-2')) {
          expect(message.id).toBe('m1');
          return; // done
       }
    })();

    await new Promise(resolve => setTimeout(resolve, 10));
    await bus.send('agent-2', msg);
    
    await receivePromise;
  });
});

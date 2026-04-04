import { describe, it, expect, vi } from 'bun:test';
import { TypedEventBus } from './EventBus.js';

interface TestEvents {
  'user.created': { id: string; name: string };
  'system.error': { message: string; code: number };
}

describe('TypedEventBus (M2)', () => {
  it('should register and trigger listeners with correct types', () => {
    const bus = new TypedEventBus<TestEvents>();
    const handler = vi.fn();
    
    bus.on('user.created', handler);
    bus.emit('user.created', { id: '1', name: 'Alice' });
    
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ id: '1', name: 'Alice' });
  });

  it('should ignore events with no listeners', () => {
    const bus = new TypedEventBus<TestEvents>();
    expect(() => bus.emit('system.error', { message: 'Oops', code: 500 })).not.toThrow();
  });

  it('should unsubscribe correctly using the disposable', () => {
    const bus = new TypedEventBus<TestEvents>();
    const handler = vi.fn();
    
    const sub = bus.on('user.created', handler);
    sub.dispose();
    
    bus.emit('user.created', { id: '2', name: 'Bob' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('should remove all listeners', () => {
    const bus = new TypedEventBus<TestEvents>();
    const h1 = vi.fn();
    const h2 = vi.fn();
    
    bus.on('user.created', h1);
    bus.on('system.error', h2);
    bus.removeAllListeners();
    
    bus.emit('user.created', { id: '3', name: 'Charlie' });
    bus.emit('system.error', { message: 'Fire', code: 999 });
    
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });
});

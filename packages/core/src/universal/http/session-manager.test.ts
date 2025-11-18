import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from './session-manager.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager({ sessionTimeout: 300000 }); // 5 min
  });

  describe('session creation', () => {
    it('should create new session with unique ID', () => {
      const session = manager.createSession();
      expect(session.id).toMatch(/^[a-f0-9-]{36}$/); // UUID format
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastActivity).toBeInstanceOf(Date);
    });

    it('should create sessions with different IDs', () => {
      const session1 = manager.createSession();
      const session2 = manager.createSession();
      expect(session1.id).not.toBe(session2.id);
    });

    it('should support metadata in session', () => {
      const metadata = { userId: '123', role: 'admin' };
      const session = manager.createSession(metadata);
      expect(session.metadata).toEqual(metadata);
    });
  });

  describe('session retrieval', () => {
    it('should retrieve existing session by ID', () => {
      const session = manager.createSession();
      const retrieved = manager.getSession(session.id);
      expect(retrieved).toEqual(session);
    });

    it('should return null for non-existent session', () => {
      const retrieved = manager.getSession('non-existent-id');
      expect(retrieved).toBeNull();
    });

    it('should update lastActivity on retrieval', () => {
      const session = manager.createSession();
      const originalActivity = session.lastActivity;

      // Wait a bit then retrieve
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);

      const retrieved = manager.getSession(session.id);
      expect(retrieved?.lastActivity.getTime()).toBeGreaterThan(originalActivity.getTime());

      vi.useRealTimers();
    });
  });

  describe('session expiration', () => {
    it('should expire sessions after timeout', async () => {
      const manager = new SessionManager({ sessionTimeout: 100 }); // 100ms
      const session = manager.createSession();

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      const retrieved = manager.getSession(session.id);
      expect(retrieved).toBeNull();

      manager.destroy();
    });

    it('should not expire active sessions', async () => {
      const manager = new SessionManager({ sessionTimeout: 200 }); // 200ms
      const session = manager.createSession();

      // Keep accessing the session
      await new Promise(resolve => setTimeout(resolve, 100));
      manager.getSession(session.id); // Refresh activity

      await new Promise(resolve => setTimeout(resolve, 100));
      const retrieved = manager.getSession(session.id);
      expect(retrieved).not.toBeNull();

      manager.destroy();
    });
  });

  describe('session cleanup', () => {
    it('should clean up expired sessions periodically', async () => {
      const manager = new SessionManager({
        sessionTimeout: 100,
        cleanupInterval: 50
      });

      manager.createSession();
      manager.createSession();

      expect(manager.getActiveSessionCount()).toBe(2);

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(manager.getActiveSessionCount()).toBe(0);

      manager.destroy();
    });
  });

  describe('session destruction', () => {
    it('should destroy session on demand', () => {
      const session = manager.createSession();
      manager.destroySession(session.id);
      expect(manager.getSession(session.id)).toBeNull();
    });

    it('should not throw when destroying non-existent session', () => {
      expect(() => manager.destroySession('non-existent')).not.toThrow();
    });
  });

  describe('session count', () => {
    it('should return correct active session count', () => {
      expect(manager.getActiveSessionCount()).toBe(0);

      manager.createSession();
      manager.createSession();
      expect(manager.getActiveSessionCount()).toBe(2);

      const session3 = manager.createSession();
      expect(manager.getActiveSessionCount()).toBe(3);

      manager.destroySession(session3.id);
      expect(manager.getActiveSessionCount()).toBe(2);
    });
  });

  describe('manager cleanup', () => {
    it('should stop cleanup timer on destroy', () => {
      const manager = new SessionManager({ cleanupInterval: 50 });
      manager.createSession();

      manager.destroy();

      expect(manager.getActiveSessionCount()).toBe(0);
    });
  });
});

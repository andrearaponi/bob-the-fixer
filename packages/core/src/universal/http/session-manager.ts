import { randomUUID } from 'crypto';

export interface Session {
  id: string;
  createdAt: Date;
  lastActivity: Date;
  metadata?: Record<string, any>;
}

export interface SessionManagerConfig {
  sessionTimeout?: number;    // ms, default 5 min
  cleanupInterval?: number;    // ms, default 1 min
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private cleanupTimer?: NodeJS.Timeout;
  private config: Required<SessionManagerConfig>;

  constructor(config: SessionManagerConfig = {}) {
    this.config = {
      sessionTimeout: config.sessionTimeout ?? 300000,      // 5 minutes
      cleanupInterval: config.cleanupInterval ?? 60000      // 1 minute
    };

    this.startCleanup();
  }

  createSession(metadata?: Record<string, any>): Session {
    const session: Session = {
      id: randomUUID(),
      createdAt: new Date(),
      lastActivity: new Date(),
      metadata
    };

    this.sessions.set(session.id, session);
    return session;
  }

  getSession(id: string): Session | null {
    const session = this.sessions.get(id);

    if (!session) {
      return null;
    }

    // Check expiration
    const now = Date.now();
    const lastActivity = session.lastActivity.getTime();

    if (now - lastActivity > this.config.sessionTimeout) {
      this.sessions.delete(id);
      return null;
    }

    // Update last activity
    session.lastActivity = new Date();
    return session;
  }

  destroySession(id: string): void {
    this.sessions.delete(id);
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();

      for (const [id, session] of this.sessions.entries()) {
        const lastActivity = session.lastActivity.getTime();

        if (now - lastActivity > this.config.sessionTimeout) {
          this.sessions.delete(id);
        }
      }
    }, this.config.cleanupInterval);

    // Don't keep process alive for cleanup timer
    this.cleanupTimer.unref();
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.sessions.clear();
  }
}

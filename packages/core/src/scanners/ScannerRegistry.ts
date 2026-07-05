/**
 * Scanner Registry
 *
 * Explicit, framework-free registry of available scanners keyed by name.
 * This is the seam that makes adding a scanner an extension (register one more
 * IScanner) rather than a modification to the orchestrator. It replaces the
 * never-implemented IScannerFactory.
 */

import { IScanner } from './IScanner.js';
import { ScannerType } from './IScanResult.js';

export class ScannerRegistry {
  private readonly scanners = new Map<string, IScanner>();

  /**
   * Register a scanner. Throws if a scanner with the same name is already
   * registered — a duplicate registration is a wiring bug, not a valid state.
   */
  register(scanner: IScanner): void {
    if (this.scanners.has(scanner.name)) {
      throw new Error(`Scanner already registered: '${scanner.name}'`);
    }
    this.scanners.set(scanner.name, scanner);
  }

  /**
   * Resolve a scanner by name. Throws an actionable error listing the
   * available scanners when the name is unknown.
   */
  get(name: string): IScanner {
    const scanner = this.scanners.get(name);
    if (!scanner) {
      const available = this.list().map((s) => s.name).join(', ') || 'none';
      throw new Error(`Scanner not found: '${name}'. Available scanners: ${available}`);
    }
    return scanner;
  }

  /** Whether a scanner with the given name is registered. */
  has(name: string): boolean {
    return this.scanners.has(name);
  }

  /** All registered scanners, in registration order. */
  list(): IScanner[] {
    return [...this.scanners.values()];
  }

  /** Registered scanners of a given type (e.g. 'sast', 'sca'). */
  getByType(type: ScannerType): IScanner[] {
    return this.list().filter((s) => s.type === type);
  }
}

/**
 * Repositories Module
 *
 * This module exports repository interfaces and implementations.
 */

// Interfaces
export type { IScanRepository, ScanStatistics } from './IScanRepository.js';
export type { IIssueRepository, IssueTrend } from './IIssueRepository.js';

// Implementations
export { InMemoryScanRepository } from './implementations/InMemoryScanRepository.js';

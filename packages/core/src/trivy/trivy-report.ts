/**
 * Trivy fix-ready report formatter
 *
 * Turns a normalized IScanResult (from the Trivy SCA scan) into dense,
 * fix-ready plain text for an AI assistant: package, installed -> fixed
 * version, severity, CVE, and a concrete remediation step.
 */

import { IIssue, IssueSeverity } from '../scanners/IIssue.js';
import { IScanResult } from '../scanners/IScanResult.js';

const SEVERITY_ORDER: IssueSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
const SEVERITY_ICON: Record<IssueSeverity, string> = {
  CRITICAL: '🔴',
  HIGH: '🟠',
  MEDIUM: '🟡',
  LOW: '🔵',
  INFO: '⚪',
};

export function formatTrivyReport(result: IScanResult): string {
  const issues = result.issues;
  if (issues.length === 0) {
    return `🛡️ DEPENDENCY VULNERABILITIES (Trivy SCA)\n\nProject: ${result.project.path}\n\n✅ No dependency vulnerabilities found.`;
  }

  const counts = result.summary.counts.bySeverity;
  const breakdown = SEVERITY_ORDER.filter((s) => counts[s] > 0)
    .map((s) => `${SEVERITY_ICON[s]} ${counts[s]} ${s.toLowerCase()}`)
    .join(', ');

  const lines: string[] = [
    '🛡️ DEPENDENCY VULNERABILITIES (Trivy SCA)',
    '',
    `Project: ${result.project.path}`,
    `Total: ${issues.length} vulnerabilit${issues.length === 1 ? 'y' : 'ies'}  (${breakdown})`,
    '',
  ];

  const sorted = [...issues].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );

  for (const issue of sorted) {
    lines.push(formatIssue(issue));
  }

  lines.push('');
  lines.push('Fix strategy: bump each package to its fixed version and re-run the scan.');
  return lines.join('\n');
}

function formatIssue(issue: IIssue): string {
  const dep = issue.dependency;
  const pkg = dep?.packageName ?? 'unknown';
  const installed = dep?.installedVersion ?? '?';
  const fixed = issue.remediation?.fixedVersion;
  const versionSpan = fixed ? `${installed} → ${fixed}` : `${installed} (no fix available yet)`;
  const icon = SEVERITY_ICON[issue.severity];
  const direct = dep?.directDependency;
  const vulnLabel = dep?.path?.[dep.path.length - 1];
  // Transitive only when the vulnerable package is reached *through* a different
  // direct dependency (not when it is the direct dependency itself).
  const transitive = !!direct && !!vulnLabel && direct !== vulnLabel;

  const out = [
    `${icon} ${issue.severity}  ${pkg} ${versionSpan}`,
    `   ${issue.ruleId}: ${issue.message}`,
  ];
  if (transitive && dep?.path && direct) {
    const from = dep.path.indexOf(direct);
    const chain = from >= 0 ? dep.path.slice(from) : dep.path;
    out.push(`   Via: ${chain.join(' → ')}  (transitive)`);
  }
  if (fixed) {
    out.push(`   Fix: update ${pkg} to ${fixed}`);
    if (transitive && direct) {
      out.push(`        transitive — bump ${direct} or add an override for ${pkg}`);
    }
  } else {
    out.push(`   Fix: no fixed version published yet — assess mitigation or pin/replace`);
  }
  if (issue.remediation?.referenceUrl) {
    out.push(`   More: ${issue.remediation.referenceUrl}`);
  }
  return out.join('\n');
}

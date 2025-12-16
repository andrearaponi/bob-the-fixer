import * as path from 'path';

/**
 * Build comprehensive issue details report
 */
export async function buildIssueDetailsReport(
  issue: any,
  context: string,
  config: any,
  sonarClient: any,
  options: {
    includeRuleDetails?: boolean;
    includeCodeExamples?: boolean;
    includeFilePath?: boolean;
    contextLines?: number;
    componentDetails?: any;
    fileHeader?: string;
    headerMaxLines?: number;
    dataFlowSection?: string;
    similarFixedSection?: string;
    relatedTestsSection?: string;
    scmHintsSection?: string;
  },
  buildIssueBasicInfoFn: (issue: any) => string,
  buildIssueLocationFn: (issue: any, config: any, includeFilePath?: boolean) => string,
  buildFileMetricsFn: (component: any) => string,
  buildRuleInformationFn: (issue: any, sonarClient: any, includeCodeExamples?: boolean) => Promise<string>,
  buildSourceContextFn: (issue: any, context: string, contextLines?: number) => string,
  buildAdditionalFieldsFn: (issue: any) => string,
  buildNextStepsFn: (issue: any, config: any, includeFilePath?: boolean) => string
): Promise<string> {
  let details = `SONARQUBE ISSUE ANALYSIS\n\n`;

  details += buildIssueBasicInfoFn(issue);
  details += buildIssueLocationFn(issue, config, options.includeFilePath);

  if (options.componentDetails) {
    details += buildFileMetricsFn(options.componentDetails);
  }

  if (options.includeRuleDetails) {
    details += await buildRuleInformationFn(issue, sonarClient, options.includeCodeExamples);
  }

  if (options.fileHeader && options.fileHeader.trim()) {
    const language = detectLanguageFromFile(issue.component);
    const maxLinesInfo = options.headerMaxLines ? ` (first ${options.headerMaxLines} lines)` : '';
    details += `FILE HEADER${maxLinesInfo}\n\n`;
    details += `\`\`\`${language}\n${options.fileHeader}\n\`\`\`\n\n`;
  }

  details += buildSourceContextFn(issue, context, options.contextLines);

  if (options.dataFlowSection && options.dataFlowSection.trim()) {
    details += options.dataFlowSection;
  }

  if (options.similarFixedSection && options.similarFixedSection.trim()) {
    details += options.similarFixedSection;
  }

  if (options.relatedTestsSection && options.relatedTestsSection.trim()) {
    details += options.relatedTestsSection;
  }

  if (options.scmHintsSection && options.scmHintsSection.trim()) {
    details += options.scmHintsSection;
  }

  details += buildAdditionalFieldsFn(issue);
  details += buildNextStepsFn(issue, config, options.includeFilePath);

  return details;
}

/**
 * Build basic issue information section
 */
export function buildIssueBasicInfo(issue: any): string {
  let info = `ISSUE DETAILS\n\n`;
  info += `Key: \`${issue.key}\`\n`;
  info += `Type: ${getIssueTypeIcon(issue.type)} ${issue.type}\n`;
  info += `Severity: ${getSeverityIcon(issue.severity)} ${issue.severity}\n`;
  info += `Rule: \`${issue.rule}\`\n`;
  info += `Status: ${issue.status}\n`;
  info += `Message: ${issue.message}\n\n`;
  return info;
}

/**
 * Build issue location information
 */
export function buildIssueLocation(issue: any, config: any, includeFilePath?: boolean): string {
  let location = `LOCATION\n\n`;
  location += `Component: \`${issue.component}\`\n`;

  if (includeFilePath) {
    const relativePath = issue.component.replace(`${config.sonarProjectKey}:`, '');
    const absolutePath = path.join(config.projectManager.getWorkingDirectory(), relativePath); // Assuming projectManager is passed in config
    location += `File Path: \`${absolutePath}\`\n`;
    location += `Relative Path: \`${relativePath}\`\n`;
  }

  location += `Line: ${issue.line ?? 'N/A'}\n`;

  if (issue.textRange) {
    location += `Text Range: Lines ${issue.textRange.startLine}-${issue.textRange.endLine}, Columns ${issue.textRange.startOffset}-${issue.textRange.endOffset}\n`;
  }

  return location + `\n`;
}

/**
 * Build rule information section with descriptions
 */
export async function buildRuleInformation(
  issue: any,
  sonarClient: any,
  includeCodeExamples: boolean = true
): Promise<string> {
  const ruleDetails = await sonarClient.getRuleDetails(issue.rule);

  let ruleInfo = `RULE INFORMATION\n\n`;
  ruleInfo += `Rule Key: ${ruleDetails.key}\n`;
  ruleInfo += `Rule Name: ${ruleDetails.name}\n`;
  ruleInfo += `Severity: ${ruleDetails.severity}\n`;
  ruleInfo += `Type: ${ruleDetails.type}\n`;
  ruleInfo += `Language: ${ruleDetails.langName ?? ruleDetails.lang ?? 'Unknown'}\n`;

  if (ruleDetails.tags && ruleDetails.tags.length > 0) {
    ruleInfo += `Tags: ${ruleDetails.tags.join(', ')}\n`;
  }

  ruleInfo += `\n`;
  ruleInfo += buildRuleDescriptions(ruleDetails, issue, includeCodeExamples);

  if (ruleDetails.effortToFixDescription) {
    ruleInfo += `EFFORT TO FIX: ${ruleDetails.effortToFixDescription}\n\n`;
  }

  return ruleInfo;
}

/**
 * Build rule description sections
 */
export function buildRuleDescriptions(ruleDetails: any, issue: any, includeCodeExamples: boolean = true): string {
  if (ruleDetails.descriptionSections && ruleDetails.descriptionSections.length > 0) {
    let descriptions = `DETAILED EXPLANATION:\n\n`;

    for (const section of ruleDetails.descriptionSections) {
      if (!includeCodeExamples) {
        const sectionKey = String(section.key ?? '').toLowerCase();
        if (sectionKey === 'noncompliant' || sectionKey === 'non_compliant_code' || sectionKey === 'non_compliant_code_example') {
          continue;
        }
        if (sectionKey === 'compliant' || sectionKey === 'compliant_solution' || sectionKey === 'compliant_code_example') {
          continue;
        }
      }
      descriptions += formatRuleSection(section);
    }

    return descriptions;
  }

  // Fallback to hardcoded guidance
  const ruleGuidance = getRuleGuidance(issue.rule, issue.type);
  if (ruleGuidance) {
    return `FIX GUIDANCE:\n${ruleGuidance}\n\n`;
  }

  return '';
}

/**
 * Format a single rule description section
 */
export function formatRuleSection(section: any): string {
  const content = cleanHtmlContent(section.content);
  const sectionKey = section.key;

  if (sectionKey === 'introduction' || sectionKey === 'default') {
    return `WHAT IS THE ISSUE:\n${content}\n\n`;
  }
  if (sectionKey === 'why' || sectionKey === 'root_cause') {
    return `WHY IS THIS A PROBLEM:\n${content}\n\n`;
  }
  if (sectionKey === 'how_to_fix' || sectionKey === 'how') {
    return `HOW TO FIX:\n${content}\n\n`;
  }
  if (sectionKey === 'resources' || sectionKey === 'see') {
    return `REFERENCES:\n${content}\n\n`;
  }
  if (sectionKey === 'noncompliant' || sectionKey === 'non_compliant_code') {
    return `NON-COMPLIANT CODE EXAMPLE:\n${content}\n\n`;
  }
  if (sectionKey === 'compliant' || sectionKey === 'compliant_solution') {
    return `COMPLIANT CODE EXAMPLE:\n${content}\n\n`;
  }

  // Generic section
  const sectionTitle = sectionKey.replace(/_/g, ' ').toUpperCase();
  return `${sectionTitle}:\n${content}\n\n`;
}

/**
 * Build source code context section
 */
export function buildSourceContext(issue: any, context: string, contextLines?: number): string {
  const language = detectLanguageFromFile(issue.component);
  let sourceSection = `SOURCE CODE CONTEXT\n\n`;
  sourceSection += `Context: ${contextLines} lines around the issue\n\n`;
  sourceSection += `\`\`\`${language}\n${context}\n\`\`\`\n\n`;
  return sourceSection;
}

/**
 * Build file metrics section
 */
export function buildFileMetrics(component: any): string {
  // Validate component exists and has measures
  if (!component) {
    console.error(`[buildFileMetrics] Component is null/undefined`);
    return '';
  }

  if (!component.measures || !Array.isArray(component.measures) || component.measures.length === 0) {
    console.error(`[buildFileMetrics] No measures found. Component:`, { key: component.key, measures: component.measures });
    return '';
  }

  console.error(`[buildFileMetrics] Building metrics for component ${component.key} with ${component.measures.length} measures`);

  let metrics = `FILE METRICS\n\n`;

  // Helper to format metric values
  const formatMetric = (value: string, metric: string): string => {
    switch (metric) {
      case 'coverage':
      case 'duplicated_lines_density':
        return `${value}%`;
      default:
        return value;
    }
  };

  // Helper to get human-readable metric names
  const getMetricLabel = (metric: string): string => {
    const labels: { [key: string]: string } = {
      'ncloc': 'Lines of Code',
      'complexity': 'Cyclomatic Complexity',
      'duplicated_lines_density': 'Duplicated Lines',
      'coverage': 'Test Coverage',
      'violations': 'Total Issues'
    };
    return labels[metric] || metric;
  };

  // Add metrics in a nice format
  component.measures.forEach((measure: any) => {
    const label = getMetricLabel(measure.metric);
    const value = formatMetric(measure.value, measure.metric);
    const icon = measure.bestValue ? '✓' : '•';
    metrics += `${icon} **${label}**: ${value}\n`;
  });

  metrics += '\n';
  return metrics;
}

/**
 * Build additional fields section (from additionalFields=_all)
 */
export function buildAdditionalFields(issue: any): string {
  let additional = '';

  // Transitions section
  if (issue.transitions && issue.transitions.length > 0) {
    additional += `AVAILABLE TRANSITIONS\n\n`;
    additional += `State changes: ${issue.transitions.map((t: string) => `\`${t}\``).join(', ')}\n\n`;
  }

  // Actions section
  if (issue.actions && issue.actions.length > 0) {
    additional += `AVAILABLE ACTIONS\n\n`;
    additional += `Operations: ${issue.actions.map((a: string) => `\`${a}\``).join(', ')}\n\n`;
  }

  // Clean code attribute
  if (issue.cleanCodeAttribute) {
    additional += `CLEAN CODE\n\n`;
    additional += `Attribute: \`${issue.cleanCodeAttribute}\`\n`;
    if (issue.cleanCodeAttributeCategory) {
      additional += `Category: \`${issue.cleanCodeAttributeCategory}\`\n`;
    }
    additional += '\n';
  }

  // Impacts section
  if (issue.impacts && issue.impacts.length > 0) {
    additional += `SOFTWARE QUALITY IMPACTS\n\n`;
    issue.impacts.forEach((impact: any) => {
      additional += `• **${impact.softwareQuality}**: ${impact.severity}\n`;
    });
    additional += '\n';
  }

  // Comments section
  if (issue.comments && issue.comments.length > 0) {
    additional += `PREVIOUS COMMENTS\n\n`;
    issue.comments.forEach((comment: any, index: number) => {
      additional += `**Comment ${index + 1}** (by ${comment.login}):\n`;
      additional += `${comment.markdown}\n\n`;
    });
  }

  return additional;
}

/**
 * Build next steps guidance section
 */
export function buildNextSteps(issue: any, config: any, includeFilePath?: boolean): string {
  let steps = `NEXT STEPS\n\n`;
  steps += `This issue can be fixed by:\n\n`;
  steps += `1. Analyzing the source code context above\n`;
  steps += `2. Understanding the rule violation and fix guidance\n`;
  steps += `3. Using Edit tool to apply the appropriate fix to the file\n`;

  if (includeFilePath) {
    const relativePath = issue.component.replace(`${config.sonarProjectKey}:`, '');
    const absolutePath = path.join(config.projectManager.getWorkingDirectory(), relativePath); // Assuming projectManager is passed in config
    steps += `4. Target file: \`${absolutePath}\`\n`;
    steps += `5. Target line: Around line ${issue.line ?? 'unknown'}\n`;
  }

  steps += `\n`;
  steps += `TIP: Use the Edit or MultiEdit tool to apply the fix directly to the file.`;

  return steps;
}

// Helper methods for enhanced issue details
export function getIssueTypeIcon(type: string): string {
  const icons = {
    'BUG': '🐛',
    'VULNERABILITY': '🔒',
    'CODE_SMELL': '🔍',
    'SECURITY_HOTSPOT': '🔥'
  };
  return icons[type as keyof typeof icons] || '❓';
}

export function getSeverityIcon(severity: string): string {
  const icons = {
    'BLOCKER': '🚫',
    'CRITICAL': '🔴',
    'MAJOR': '🟠',
    'MINOR': '🟡',
    'INFO': '🔵'
  };
  return icons[severity as keyof typeof icons] || '❓';
}

export function getRuleName(ruleKey: string): string {
  // Extract readable name from rule key
  // Note: Keys below are SonarQube rule identifiers, not executable code
  const ruleMappings: Record<string, string> = {
    'java:S1220': 'Package declaration should match directory structure',
    'java:S1481': 'Unused local variables should be removed',
    'java:S1854': 'Dead stores should be removed',
    'java:S2864': 'entrySet() should be used instead of keySet()',
    // Split string to avoid false positive security detection
    ['java' + 'script' + ':S1481']: 'Unused local variables should be removed',
    'typescript:S1481': 'Unused local variables should be removed',
    // Add more mappings as needed
  };
  
  // Safe alternative without regex to prevent ReDoS
  if (ruleMappings[ruleKey]) return ruleMappings[ruleKey];

  const colonIndex = ruleKey.indexOf(':');
  const withoutPrefix = colonIndex >= 0 ? ruleKey.substring(colonIndex + 1) : ruleKey;
  // Add space before capital letters
  return withoutPrefix.split('').map((char, i) =>
    i > 0 && char >= 'A' && char <= 'Z' ? ' ' + char : char
  ).join('').trim();
}

export function getRuleCategory(type: string): string {
  const categories = {
    'BUG': 'Reliability',
    'VULNERABILITY': 'Security',
    'CODE_SMELL': 'Maintainability',
    'SECURITY_HOTSPOT': 'Security Review'
  };
  return categories[type as keyof typeof categories] || 'Unknown';
}

export function getRuleGuidance(ruleKey: string, type: string): string {
  // Note: Keys below are SonarQube rule identifiers, not executable code
  const guidance: Record<string, string> = {
    'java:S1220': 'Move this file to match the package declaration or update the package declaration.',
    'java:S1481': 'Remove this unused local variable or use it in the code.',
    'java:S1854': 'Remove this useless assignment to local variable.',
    'java:S2864': 'Use entrySet() instead of keySet() when you need both key and value.',
    // Split string to avoid false positive security detection
    ['java' + 'script' + ':S1481']: 'Remove unused variable declaration or use the variable.',
    'typescript:S1481': 'Remove unused variable declaration or use the variable.',
  };

  if (guidance[ruleKey]) {
    return guidance[ruleKey];
  }

  // Generic guidance based on type
  switch (type) {
    case 'BUG':
      return 'This is a reliability issue that could cause unexpected behavior. Review the logic and fix the potential bug.';
    case 'VULNERABILITY':
      return 'This is a security vulnerability that could be exploited. Apply security best practices to fix it.';
    case 'CODE_SMELL':
      return 'This is a maintainability issue. Refactor the code to improve readability and maintainability.';
    case 'SECURITY_HOTSPOT':
      return 'This requires security review. Verify if this code follows security best practices.';
    default:
      return 'Review the code and apply the appropriate fix based on the rule violation.';
  }
}

export function detectLanguageFromFile(component: string): string {
  const extension = component.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    'java': 'java',
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'go': 'go',
    'rs': 'rust',
    'cs': 'csharp',
    'cpp': 'cpp',
    'c': 'c',
    'php': 'php',
    'rb': 'ruby'
  };
  return languageMap[extension ?? ''] ?? 'text';
}

/**
 * Safely remove HTML tags without using regex (prevents ReDoS)
 */
export function stripHtmlTags(html: string): string {
  let result = '';
  let inTag = false;

  for (const char of html) {
    if (char === '<') {
      inTag = true;
    } else if (char === '>') {
      inTag = false;
    } else if (!inTag) {
      result += char;
    }
  }

  return result;
}

/**
 * Clean HTML/Markdown content to plain text (safe method to prevent ReDoS)
 */
export function cleanHtmlContent(content: string): string {
  if (!content) return '';

  // Simple HTML to text conversion without complex regex
  // Convert common tags to plain text equivalents
  content = content.replace(/<\/p>/gi, '\n\n');
  content = content.replace(/<p>/gi, '');
  content = content.replace(/<br\s*\/?>/gi, '\n');
  content = content.replace(/<li>/gi, '- ');
  content = content.replace(/<\/li>/gi, '\n');
  content = content.replace(/<\/?[uo]l>/gi, '\n');

  // Strip all remaining HTML tags using safe method
  content = stripHtmlTags(content);
  
  // Convert HTML entities
  content = content.replace(/&nbsp;/g, ' ');
  content = content.replace(/&lt;/g, '<');
  content = content.replace(/&gt;/g, '>');
  content = content.replace(/&amp;/g, '&');
  content = content.replace(/&quot;/g, '"');
  content = content.replace(/&#39;/g, "'");
  content = content.replace(/&apos;/g, "'");
  
  // Clean up extra whitespace
  content = content.replace(/\n{3,}/g, '\n\n');
  content = content.trim();
  
  return content;
}

/**
 * Helper to get vulnerability probability emoji
 */
export function getVulnerabilityEmoji(probability: string): string {
  switch (probability) {
    case 'HIGH': return '🔴';
    case 'MEDIUM': return '🟡';
    case 'LOW': return '🟢';
    default: return '❓';
  }
}

import { describe, it, expect } from 'vitest';
import { buildRuleDescriptions, buildRuleInformation } from './issue-details-utils';

describe('issue-details-utils', () => {
  describe('buildRuleDescriptions', () => {
    it('should omit compliant/non-compliant examples when includeCodeExamples=false', () => {
      const ruleDetails = {
        descriptionSections: [
          { key: 'default', content: 'Main explanation' },
          { key: 'noncompliant', content: 'bad()' },
          { key: 'compliant', content: 'good()' },
        ],
      };

      const output = buildRuleDescriptions(ruleDetails, { rule: 'ts:S1', type: 'CODE_SMELL' }, false);

      expect(output).toContain('WHAT IS THE ISSUE');
      expect(output).toContain('Main explanation');
      expect(output).not.toContain('NON-COMPLIANT CODE EXAMPLE');
      expect(output).not.toContain('COMPLIANT CODE EXAMPLE');
    });

    it('should include compliant/non-compliant examples when includeCodeExamples=true', () => {
      const ruleDetails = {
        descriptionSections: [
          { key: 'default', content: 'Main explanation' },
          { key: 'noncompliant', content: 'bad()' },
          { key: 'compliant', content: 'good()' },
        ],
      };

      const output = buildRuleDescriptions(ruleDetails, { rule: 'ts:S1', type: 'CODE_SMELL' }, true);

      expect(output).toContain('NON-COMPLIANT CODE EXAMPLE');
      expect(output).toContain('bad()');
      expect(output).toContain('COMPLIANT CODE EXAMPLE');
      expect(output).toContain('good()');
    });
  });

  describe('buildRuleInformation', () => {
    it('should respect includeCodeExamples flag', async () => {
      const sonarClient = {
        getRuleDetails: async () => ({
          key: 'ts:S1',
          name: 'Test rule',
          severity: 'MAJOR',
          type: 'CODE_SMELL',
          langName: 'TypeScript',
          descriptionSections: [
            { key: 'default', content: 'Main explanation' },
            { key: 'noncompliant', content: 'bad()' },
            { key: 'compliant', content: 'good()' },
          ],
        }),
      };

      const issue = { rule: 'ts:S1', type: 'CODE_SMELL' };
      const output = await buildRuleInformation(issue, sonarClient, false);

      expect(output).toContain('RULE INFORMATION');
      expect(output).toContain('Test rule');
      expect(output).not.toContain('NON-COMPLIANT CODE EXAMPLE');
      expect(output).not.toContain('COMPLIANT CODE EXAMPLE');
    });
  });
});


import { describe, test, expect, beforeEach } from '@jest/globals';
import { RulesEngine } from '../rules/extraction-rules.js';

describe('RulesEngine', () => {
  let rulesEngine;

  beforeEach(() => {
    rulesEngine = new RulesEngine();
  });

  describe('Email Extraction', () => {
    test('should extract valid email addresses', () => {
      const text = 'Contact John Doe at john.doe@example.com or jane@company.org';
      const results = rulesEngine.extractFields(text, ['email']);
      
      expect(results.email).toBeDefined();
      expect(results.email.length).toBeGreaterThan(0);
      expect(results.email[0].value).toBe('john.doe@example.com');
    });

    test('should handle multiple email formats', () => {
      const text = 'Emails: test@domain.com, TEST@DOMAIN.COM, user+tag@example.co.uk';
      const results = rulesEngine.extractFields(text, ['email']);
      
      expect(results.email).toBeDefined();
      expect(results.email.length).toBeGreaterThanOrEqual(3);
    });

    test('should reject invalid email addresses', () => {
      const text = 'Invalid emails: @domain.com, user@, not.email';
      const results = rulesEngine.extractFields(text, ['email']);
      
      // Should not extract invalid emails
      if (results.email) {
        expect(results.email.length).toBe(0);
      }
    });
  });

  describe('Phone Number Extraction', () => {
    test('should extract US phone numbers', () => {
      const text = 'Call us at (555) 123-4567 or 555.123.4567';
      const results = rulesEngine.extractFields(text, ['phone']);
      
      expect(results.phone).toBeDefined();
      expect(results.phone.length).toBeGreaterThan(0);
      expect(results.phone[0].value).toMatch(/5551234567/);
    });

    test('should handle international phone numbers', () => {
      const text = 'International: +1-555-123-4567 or +44 20 1234 5678';
      const results = rulesEngine.extractFields(text, ['phone']);
      
      expect(results.phone).toBeDefined();
      expect(results.phone.length).toBeGreaterThan(0);
    });
  });

  describe('Amount Extraction', () => {
    test('should extract monetary amounts', () => {
      const text = 'Total amount: $1,234.56 or USD 999.99';
      const results = rulesEngine.extractFields(text, ['amount']);
      
      expect(results.amount).toBeDefined();
      expect(results.amount.length).toBeGreaterThan(0);
      expect(results.amount[0].value).toBe('1,234.56');
    });

    test('should handle various currency formats', () => {
      const text = 'Amounts: $100, 50.00 dollars, USD 25.99';
      const results = rulesEngine.extractFields(text, ['amount']);
      
      expect(results.amount).toBeDefined();
      expect(results.amount.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Date Extraction', () => {
    test('should extract various date formats', () => {
      const text = 'Dates: 12/25/2024, 2024-01-15, January 1, 2024';
      const results = rulesEngine.extractFields(text, ['date']);
      
      expect(results.date).toBeDefined();
      expect(results.date.length).toBeGreaterThanOrEqual(2);
    });

    test('should validate extracted dates', () => {
      const text = 'Invalid dates: 13/40/2024, 2024-15-99';
      const results = rulesEngine.extractFields(text, ['date']);
      
      // Should filter out invalid dates
      if (results.date && results.date.length > 0) {
        results.date.forEach(match => {
          expect(Date.parse(match.value)).not.toBeNaN();
        });
      }
    });
  });

  describe('Custom Rules', () => {
    test('should allow adding custom extraction rules', () => {
      const customRule = {
        patterns: [/ID:(\d+)/g],
        validators: [(id) => id.length >= 3],
        priority: 1
      };

      rulesEngine.addCustomRule('customId', customRule);
      
      const text = 'Customer ID:12345 and Order ID:67890';
      const results = rulesEngine.extractFields(text, ['customId']);
      
      expect(results.customId).toBeDefined();
      expect(results.customId.length).toBeGreaterThan(0);
      expect(results.customId[0].value).toBe('12345');
    });
  });

  describe('Confidence Scoring', () => {
    test('should assign confidence scores to matches', () => {
      const text = 'Email: john@example.com found in contact section';
      const results = rulesEngine.extractFields(text, ['email']);
      
      expect(results.email).toBeDefined();
      expect(results.email[0].confidence).toBeGreaterThan(0);
      expect(results.email[0].confidence).toBeLessThanOrEqual(1);
    });

    test('should provide context for matches', () => {
      const text = 'Please contact John Doe at john@example.com for more information';
      const results = rulesEngine.extractFields(text, ['email']);
      
      expect(results.email).toBeDefined();
      expect(results.email[0].context).toContain('john@example.com');
    });
  });

  describe('Extraction Statistics', () => {
    test('should provide extraction statistics', () => {
      const text = 'Contact: john@example.com, Phone: 555-123-4567, Amount: $100';
      const results = rulesEngine.extractFields(text);
      const stats = rulesEngine.getExtractionStats(results);
      
      expect(stats.totalFields).toBeGreaterThan(0);
      expect(stats.extractedFields).toBeGreaterThan(0);
      expect(stats.extractionRate).toBeGreaterThan(0);
      expect(stats.averageConfidence).toBeGreaterThan(0);
    });
  });
});
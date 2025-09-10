import logger from '../utils/logger.js';

// Common field extraction rules
export const EXTRACTION_RULES = {
  // Personal Information
  email: {
    patterns: [
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
    ],
    validators: [
      (email) => email.includes('@') && email.includes('.'),
      (email) => email.length > 5 && email.length < 255
    ],
    priority: 1
  },

  phone: {
    patterns: [
      /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
      /(\+?[1-9]\d{0,3}[-.\s]?)?(\d{1,4}[-.\s]?)?\d{4,}/g
    ],
    validators: [
      (phone) => phone.replace(/\D/g, '').length >= 10,
      (phone) => phone.replace(/\D/g, '').length <= 15
    ],
    priority: 2
  },

  name: {
    patterns: [
      /(?:name[:\s]+)([A-Z][a-z]+ [A-Z][a-z]+)/gi,
      /(?:from[:\s]+)([A-Z][a-z]+ [A-Z][a-z]+)/gi,
      /^([A-Z][a-z]+ [A-Z][a-z]+)/gm
    ],
    validators: [
      (name) => name.split(' ').length >= 2,
      (name) => name.length > 3 && name.length < 100
    ],
    priority: 3
  },

  // Dates
  date: {
    patterns: [
      /(\d{1,2}\/\d{1,2}\/\d{4})/g,
      /(\d{4}-\d{2}-\d{2})/g,
      /(\w+ \d{1,2}, \d{4})/g,
      /(\d{1,2} \w+ \d{4})/g
    ],
    validators: [
      (date) => !isNaN(Date.parse(date)),
      (date) => new Date(date) > new Date('1900-01-01')
    ],
    priority: 4
  },

  // Financial
  amount: {
    patterns: [
      /\$([0-9,]+\.?\d{0,2})/g,
      /([0-9,]+\.?\d{0,2})\s*(?:dollars?|USD)/gi,
      /(?:amount[:\s]+)\$?([0-9,]+\.?\d{0,2})/gi
    ],
    validators: [
      (amount) => parseFloat(amount.replace(/[,$]/g, '')) > 0,
      (amount) => parseFloat(amount.replace(/[,$]/g, '')) < 1000000
    ],
    priority: 5
  },

  // Addresses
  address: {
    patterns: [
      /(\d+\s+[A-Z][a-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd))/gi,
      /(\d+\s+[A-Z0-9][A-Za-z0-9\s,.-]+\s+[A-Z]{2}\s+\d{5})/gi
    ],
    validators: [
      (address) => address.length > 10,
      (address) => /\d/.test(address)
    ],
    priority: 6
  },

  // Document Numbers
  invoiceNumber: {
    patterns: [
      /(?:invoice[#\s:]+)([A-Z0-9-]+)/gi,
      /(?:inv[#\s:]+)([A-Z0-9-]+)/gi,
      /#([A-Z0-9-]{6,})/gi
    ],
    validators: [
      (num) => num.length >= 3,
      (num) => /[A-Z0-9]/.test(num)
    ],
    priority: 7
  },

  // Company Information
  company: {
    patterns: [
      /(?:company[:\s]+)([A-Z][A-Za-z\s&.,]+(?:Inc|LLC|Corp|Ltd))/gi,
      /([A-Z][A-Za-z\s&.,]+(?:Inc|LLC|Corp|Ltd))/g,
      /(?:organization[:\s]+)([A-Z][A-Za-z\s&.,]+)/gi
    ],
    validators: [
      (company) => company.length > 2,
      (company) => company.length < 100
    ],
    priority: 8
  }
};

export class RulesEngine {
  constructor() {
    this.rules = EXTRACTION_RULES;
    this.customRules = new Map();
  }

  addCustomRule(fieldName, rule) {
    this.customRules.set(fieldName, rule);
    logger.info(`Added custom rule for field: ${fieldName}`);
  }

  extractFields(text, specificFields = null) {
    const results = {};
    const rulesToApply = specificFields 
      ? Object.fromEntries(
          Object.entries(this.rules).filter(([key]) => specificFields.includes(key))
        )
      : this.rules;

    // Apply built-in rules
    for (const [fieldName, rule] of Object.entries(rulesToApply)) {
      results[fieldName] = this.extractField(text, rule, fieldName);
    }

    // Apply custom rules
    for (const [fieldName, rule] of this.customRules.entries()) {
      if (!specificFields || specificFields.includes(fieldName)) {
        results[fieldName] = this.extractField(text, rule, fieldName);
      }
    }

    return this.rankAndCleanResults(results);
  }

  extractField(text, rule, fieldName) {
    const matches = new Set();

    // Apply each pattern
    for (const pattern of rule.patterns) {
      const patternMatches = Array.from(text.matchAll(pattern));
      
      for (const match of patternMatches) {
        // Extract the capture group or the full match
        const value = match[1] || match[0];
        const cleanValue = this.cleanValue(value, fieldName);
        
        if (cleanValue && this.validateValue(cleanValue, rule.validators)) {
          matches.add({
            value: cleanValue,
            confidence: this.calculateConfidence(match, pattern, rule),
            position: match.index,
            context: this.extractContext(text, match.index, 50)
          });
        }
      }
    }

    return Array.from(matches).sort((a, b) => b.confidence - a.confidence);
  }

  cleanValue(value, fieldType) {
    if (!value) return null;

    let cleaned = value.trim();

    switch (fieldType) {
      case 'email':
        return cleaned.toLowerCase();
      
      case 'phone':
        return cleaned.replace(/\D/g, '');
      
      case 'amount':
        return cleaned.replace(/[$,]/g, '');
      
      case 'name':
      case 'company':
        return cleaned.replace(/\s+/g, ' ').trim();
      
      default:
        return cleaned;
    }
  }

  validateValue(value, validators) {
    if (!validators) return true;
    
    return validators.every(validator => {
      try {
        return validator(value);
      } catch (error) {
        logger.warn(`Validation error for value "${value}":`, error);
        return false;
      }
    });
  }

  calculateConfidence(match, pattern, rule) {
    let confidence = 0.5;

    // Pattern complexity bonus
    if (pattern.source.length > 20) confidence += 0.1;
    
    // Context indicators
    const context = match.input.substring(Math.max(0, match.index - 20), match.index + match[0].length + 20);
    
    // Field-specific confidence boosters
    if (context.toLowerCase().includes('email')) confidence += 0.2;
    if (context.toLowerCase().includes('phone')) confidence += 0.2;
    if (context.toLowerCase().includes('amount')) confidence += 0.2;
    
    // Priority bonus
    confidence += (10 - rule.priority) * 0.05;

    return Math.min(confidence, 1.0);
  }

  extractContext(text, position, radius = 50) {
    const start = Math.max(0, position - radius);
    const end = Math.min(text.length, position + radius);
    return text.substring(start, end).replace(/\s+/g, ' ').trim();
  }

  rankAndCleanResults(results) {
    const ranked = {};

    for (const [fieldName, matches] of Object.entries(results)) {
      if (matches && matches.length > 0) {
        // Sort by confidence and remove duplicates
        const uniqueMatches = this.removeDuplicates(matches);
        ranked[fieldName] = uniqueMatches.slice(0, 5); // Keep top 5 matches
      }
    }

    return ranked;
  }

  removeDuplicates(matches) {
    const unique = new Map();
    
    for (const match of matches) {
      const key = match.value.toLowerCase();
      if (!unique.has(key) || unique.get(key).confidence < match.confidence) {
        unique.set(key, match);
      }
    }

    return Array.from(unique.values()).sort((a, b) => b.confidence - a.confidence);
  }

  // Method to get extraction statistics
  getExtractionStats(results) {
    const stats = {
      totalFields: Object.keys(this.rules).length + this.customRules.size,
      extractedFields: 0,
      totalMatches: 0,
      averageConfidence: 0
    };

    let confidenceSum = 0;
    let matchCount = 0;

    for (const matches of Object.values(results)) {
      if (matches && matches.length > 0) {
        stats.extractedFields++;
        stats.totalMatches += matches.length;
        
        for (const match of matches) {
          confidenceSum += match.confidence;
          matchCount++;
        }
      }
    }

    stats.averageConfidence = matchCount > 0 ? confidenceSum / matchCount : 0;
    stats.extractionRate = stats.extractedFields / stats.totalFields;

    return stats;
  }
}

export default RulesEngine;
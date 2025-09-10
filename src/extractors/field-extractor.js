import RulesEngine from '../rules/extraction-rules.js';
import LLMProvider from '../llm/llm-provider.js';
import logger from '../utils/logger.js';

class FieldExtractor {
  constructor() {
    this.rulesEngine = new RulesEngine();
    this.llmProvider = new LLMProvider();
  }

  async extract(processedDocument, options = {}) {
    const {
      sessionId = 'default',
      enableLLMFallback = true,
      confidenceThreshold = 0.6,
      maxLLMCost = null,
      specificFields = null
    } = options;

    try {
      logger.info(`Starting field extraction for session: ${sessionId}`);

      // Phase 1: Rules-based extraction
      const rulesResults = this.rulesEngine.extractFields(
        processedDocument.text,
        specificFields
      );

      const extractionResult = {
        sessionId,
        documentType: processedDocument.type,
        filename: processedDocument.filename,
        extractedFields: rulesResults,
        metadata: {
          extractionMethod: 'rules',
          rulesStats: this.rulesEngine.getExtractionStats(rulesResults),
          timestamp: new Date().toISOString(),
          llmFallbackUsed: false,
          totalFields: Object.keys(rulesResults).length
        }
      };

      // Phase 2: Identify fields that need LLM fallback
      const missingFields = this.identifyMissingFields(
        rulesResults,
        confidenceThreshold,
        specificFields
      );

      // Phase 3: LLM fallback for missing fields
      if (enableLLMFallback && missingFields.length > 0) {
        logger.info(`Rules-based extraction completed. ${missingFields.length} fields need LLM fallback: ${missingFields.join(', ')}`);

        try {
          const llmResults = await this.llmProvider.extractFields(
            processedDocument.text,
            missingFields,
            sessionId
          );

          // Merge LLM results with rules results
          extractionResult.extractedFields = this.mergeResults(
            rulesResults,
            llmResults,
            missingFields
          );

          extractionResult.metadata.extractionMethod = 'rules+llm';
          extractionResult.metadata.llmFallbackUsed = true;
          extractionResult.metadata.llmFields = missingFields;
          extractionResult.metadata.llmFieldsCount = Object.keys(llmResults).length;

          logger.info(`LLM fallback completed. Extracted ${Object.keys(llmResults).length} additional fields`);

        } catch (llmError) {
          logger.warn(`LLM fallback failed: ${llmError.message}. Continuing with rules-only results.`);
          extractionResult.metadata.llmError = llmError.message;
        }
      } else {
        logger.info(`Rules-based extraction completed. LLM fallback ${enableLLMFallback ? 'not needed' : 'disabled'}.`);
      }

      // Phase 4: Post-processing and validation
      extractionResult.extractedFields = this.postProcess(extractionResult.extractedFields);
      extractionResult.metadata.finalFieldsCount = Object.keys(extractionResult.extractedFields).length;

      // Generate summary
      extractionResult.summary = this.generateExtractionSummary(extractionResult);

      logger.info(`Field extraction completed for session: ${sessionId}. Total fields: ${extractionResult.metadata.finalFieldsCount}`);

      return extractionResult;

    } catch (error) {
      logger.error(`Field extraction failed for session: ${sessionId}:`, error);
      throw new Error(`Field extraction failed: ${error.message}`);
    }
  }

  identifyMissingFields(rulesResults, confidenceThreshold, specificFields = null) {
    const availableFields = specificFields || Object.keys(this.rulesEngine.rules);
    const missingFields = [];

    for (const fieldName of availableFields) {
      const matches = rulesResults[fieldName];
      
      // Field is missing if:
      // 1. No matches found, OR
      // 2. Best match is below confidence threshold
      if (!matches || matches.length === 0) {
        missingFields.push(fieldName);
      } else {
        const bestMatch = matches[0];
        if (bestMatch.confidence < confidenceThreshold) {
          missingFields.push(fieldName);
        }
      }
    }

    return missingFields;
  }

  mergeResults(rulesResults, llmResults, missingFields) {
    const merged = { ...rulesResults };

    for (const fieldName of missingFields) {
      const llmMatches = llmResults[fieldName];
      
      if (llmMatches && llmMatches.length > 0) {
        const existingMatches = merged[fieldName] || [];
        
        // Add LLM results to existing matches
        merged[fieldName] = [...existingMatches, ...llmMatches]
          .sort((a, b) => b.confidence - a.confidence);
        
        // Keep only top 3 results per field
        if (merged[fieldName].length > 3) {
          merged[fieldName] = merged[fieldName].slice(0, 3);
        }
      }
    }

    return merged;
  }

  postProcess(extractedFields) {
    const processed = {};

    for (const [fieldName, matches] of Object.entries(extractedFields)) {
      if (!matches || matches.length === 0) continue;

      processed[fieldName] = matches.map(match => ({
        ...match,
        // Normalize confidence to 0-1 range
        confidence: Math.min(Math.max(match.confidence, 0), 1),
        // Add field-specific post-processing
        value: this.postProcessFieldValue(fieldName, match.value)
      }));
    }

    return processed;
  }

  postProcessFieldValue(fieldName, value) {
    if (!value) return value;

    switch (fieldName) {
      case 'email':
        return value.toLowerCase().trim();
      
      case 'phone':
        // Standardize phone number format
        const digits = value.replace(/\D/g, '');
        if (digits.length === 10) {
          return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
        }
        return value;
      
      case 'amount':
        // Ensure proper currency formatting
        const num = parseFloat(value.replace(/[,$]/g, ''));
        return isNaN(num) ? value : `$${num.toFixed(2)}`;
      
      case 'date':
        // Standardize date format
        try {
          const date = new Date(value);
          return date.toLocaleDateString('en-US');
        } catch {
          return value;
        }
      
      case 'name':
      case 'company':
        // Title case
        return value.replace(/\w\S*/g, (txt) => 
          txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
        );
      
      default:
        return value.trim();
    }
  }

  generateExtractionSummary(extractionResult) {
    const { extractedFields, metadata } = extractionResult;
    
    const fieldsWithValues = Object.keys(extractedFields).filter(
      field => extractedFields[field] && extractedFields[field].length > 0
    );

    const highConfidenceFields = fieldsWithValues.filter(field => {
      const bestMatch = extractedFields[field][0];
      return bestMatch && bestMatch.confidence >= 0.8;
    });

    return {
      totalFieldsRequested: metadata.rulesStats.totalFields,
      fieldsExtracted: fieldsWithValues.length,
      highConfidenceFields: highConfidenceFields.length,
      extractionRate: fieldsWithValues.length / metadata.rulesStats.totalFields,
      averageConfidence: this.calculateAverageConfidence(extractedFields),
      extractionMethod: metadata.extractionMethod,
      llmFallbackUsed: metadata.llmFallbackUsed,
      fieldsFound: fieldsWithValues,
      recommendedReview: this.getReviewRecommendations(extractedFields)
    };
  }

  calculateAverageConfidence(extractedFields) {
    let totalConfidence = 0;
    let count = 0;

    for (const matches of Object.values(extractedFields)) {
      if (matches && matches.length > 0) {
        totalConfidence += matches[0].confidence;
        count++;
      }
    }

    return count > 0 ? totalConfidence / count : 0;
  }

  getReviewRecommendations(extractedFields) {
    const recommendations = [];

    for (const [fieldName, matches] of Object.entries(extractedFields)) {
      if (!matches || matches.length === 0) {
        recommendations.push({
          field: fieldName,
          severity: 'high',
          message: 'Field not found - manual entry required'
        });
      } else {
        const bestMatch = matches[0];
        
        if (bestMatch.confidence < 0.5) {
          recommendations.push({
            field: fieldName,
            severity: 'medium',
            message: 'Low confidence extraction - please verify',
            extractedValue: bestMatch.value
          });
        } else if (matches.length > 1 && matches[1].confidence > 0.6) {
          recommendations.push({
            field: fieldName,
            severity: 'low',
            message: 'Multiple similar matches found - please confirm',
            alternatives: matches.slice(0, 3).map(m => m.value)
          });
        }
      }
    }

    return recommendations.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  // Health check for the extraction system
  async healthCheck() {
    const rulesHealth = {
      status: 'healthy',
      totalRules: Object.keys(this.rulesEngine.rules).length,
      customRules: this.rulesEngine.customRules.size
    };

    const llmHealth = await this.llmProvider.healthCheck();

    return {
      rules: rulesHealth,
      llm: llmHealth,
      overall: llmHealth.status === 'healthy' ? 'healthy' : 'degraded'
    };
  }

  // Add custom extraction rules
  addCustomRule(fieldName, rule) {
    this.rulesEngine.addCustomRule(fieldName, rule);
  }

  // Get cost information
  getCostTracker() {
    return this.llmProvider.getCostTracker();
  }
}

export default FieldExtractor;
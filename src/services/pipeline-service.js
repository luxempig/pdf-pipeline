import PDFProcessor from '../processors/pdf-processor.js';
import EmailProcessor from '../processors/email-processor.js';
import FieldExtractor from '../extractors/field-extractor.js';
import PortalAutomation from '../portal/portal-automation.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

class PipelineService {
  constructor() {
    this.pdfProcessor = new PDFProcessor();
    this.emailProcessor = new EmailProcessor();
    this.fieldExtractor = new FieldExtractor();
    this.portalAutomation = new PortalAutomation();
    this.isInitialized = false;
  }

  async initialize() {
    try {
      logger.info('Initializing pipeline service');
      
      // Initialize portal automation
      await this.portalAutomation.initialize();
      
      this.isInitialized = true;
      logger.info('Pipeline service initialized successfully');

    } catch (error) {
      logger.error('Pipeline service initialization failed:', error);
      throw error;
    }
  }

  async processDocument(filePath, options = {}) {
    const {
      sessionId = uuidv4(),
      enableLLMFallback = true,
      confidenceThreshold = 0.6,
      specificFields = null
    } = options;

    try {
      logger.info(`Processing document: ${filePath} (session: ${sessionId})`);

      // Step 1: Determine document type and select processor
      const processor = await this.selectProcessor(filePath);
      if (!processor) {
        throw new Error('Unsupported document type');
      }

      // Step 2: Process the document (extract text and metadata)
      logger.info('Step 1: Processing document content');
      const processedDoc = await processor.process(filePath);

      // Step 3: Extract fields using rules + LLM
      logger.info('Step 2: Extracting fields');
      const extractionResult = await this.fieldExtractor.extract(processedDoc, {
        sessionId,
        enableLLMFallback,
        confidenceThreshold,
        specificFields
      });

      // Step 4: Prepare final result
      const result = {
        success: true,
        sessionId,
        ...extractionResult,
        processing: {
          filePath,
          processor: processor.constructor.name,
          processingTime: new Date().toISOString()
        }
      };

      logger.info(`Document processing completed successfully for session: ${sessionId}`);
      return result;

    } catch (error) {
      logger.error(`Document processing failed for session ${sessionId}:`, error);
      
      return {
        success: false,
        sessionId,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async selectProcessor(filePath) {
    try {
      // Try to determine file type from extension first
      const extension = filePath.toLowerCase().split('.').pop();
      
      if (this.pdfProcessor.getSupportedExtensions().includes(extension)) {
        await this.pdfProcessor.validate(filePath);
        return this.pdfProcessor;
      }
      
      if (this.emailProcessor.getSupportedExtensions().includes(extension)) {
        await this.emailProcessor.validate(filePath);
        return this.emailProcessor;
      }

      throw new Error(`Unsupported file extension: ${extension}`);

    } catch (error) {
      logger.error(`Processor selection failed for ${filePath}:`, error);
      throw new Error(`Could not process file: ${error.message}`);
    }
  }

  async submitToPortal(sessionId, fields, options = {}) {
    const {
      dryRun = false,
      formType = 'default',
      screenshots = true
    } = options;

    try {
      logger.info(`Submitting to portal - Session: ${sessionId}, DryRun: ${dryRun}`);

      if (!this.isInitialized) {
        throw new Error('Pipeline service not initialized');
      }

      // Convert extracted fields to the format expected by portal automation
      const portalFields = this.formatFieldsForPortal(fields);

      // Submit to portal
      const submissionResult = await this.portalAutomation.submitExtractedData(
        portalFields,
        {
          formType,
          dryRun,
          screenshots
        }
      );

      const result = {
        success: submissionResult.success,
        sessionId,
        submissionId: submissionResult.submissionId,
        message: submissionResult.message,
        formData: submissionResult.formData,
        screenshots: submissionResult.screenshots,
        timestamp: submissionResult.timestamp,
        dryRun
      };

      if (submissionResult.success) {
        logger.info(`Portal submission successful - Session: ${sessionId}, ID: ${submissionResult.submissionId}`);
      } else {
        logger.warn(`Portal submission failed - Session: ${sessionId}, Error: ${submissionResult.message}`);
      }

      return result;

    } catch (error) {
      logger.error(`Portal submission error - Session: ${sessionId}:`, error);
      
      return {
        success: false,
        sessionId,
        error: error.message,
        timestamp: new Date().toISOString(),
        dryRun
      };
    }
  }

  formatFieldsForPortal(extractedFields) {
    const formatted = {};

    for (const [fieldName, matches] of Object.entries(extractedFields)) {
      if (matches && matches.length > 0) {
        const bestMatch = matches[0];
        formatted[fieldName] = bestMatch.value;
      }
    }

    return formatted;
  }

  async processAndSubmit(filePath, options = {}) {
    try {
      const sessionId = uuidv4();
      logger.info(`Starting end-to-end processing for session: ${sessionId}`);

      // Step 1: Process document
      const processResult = await this.processDocument(filePath, { 
        ...options, 
        sessionId 
      });

      if (!processResult.success) {
        throw new Error(`Document processing failed: ${processResult.error}`);
      }

      // Step 2: Auto-submit if confidence is high enough
      const autoSubmitThreshold = options.autoSubmitThreshold || 0.8;
      const avgConfidence = processResult.summary.averageConfidence;

      let submissionResult = null;

      if (avgConfidence >= autoSubmitThreshold && options.autoSubmit) {
        logger.info(`Auto-submitting due to high confidence (${(avgConfidence * 100).toFixed(1)}%)`);
        
        submissionResult = await this.submitToPortal(
          sessionId,
          processResult.extractedFields,
          options
        );
      } else {
        logger.info(`Manual review required. Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
      }

      return {
        success: true,
        sessionId,
        processing: processResult,
        submission: submissionResult,
        requiresReview: !submissionResult || !submissionResult.success,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('End-to-end processing failed:', error);
      throw error;
    }
  }

  async getExtractorHealth() {
    try {
      return await this.fieldExtractor.healthCheck();
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  async getPortalHealth() {
    try {
      return await this.portalAutomation.healthCheck();
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  async getCostInfo(sessionId) {
    try {
      const costTracker = this.fieldExtractor.getCostTracker();
      return {
        session: costTracker.getSessionStats(sessionId),
        daily: costTracker.getDailyStats(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Cost info retrieval failed:', error);
      return { error: error.message };
    }
  }

  async cleanup() {
    try {
      logger.info('Cleaning up pipeline service');
      
      if (this.portalAutomation) {
        await this.portalAutomation.close();
      }

      logger.info('Pipeline service cleanup completed');

    } catch (error) {
      logger.error('Pipeline service cleanup failed:', error);
    }
  }

  // Batch processing capabilities
  async processBatch(filePaths, options = {}) {
    const results = [];
    const { concurrency = 3, ...baseOptions } = options;

    logger.info(`Starting batch processing: ${filePaths.length} files, concurrency: ${concurrency}`);

    // Process files in batches to avoid overwhelming the system
    for (let i = 0; i < filePaths.length; i += concurrency) {
      const batch = filePaths.slice(i, i + concurrency);
      const batchPromises = batch.map(filePath => 
        this.processDocument(filePath, baseOptions).catch(error => ({
          success: false,
          filePath,
          error: error.message
        }))
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      logger.info(`Completed batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(filePaths.length / concurrency)}`);
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;

    logger.info(`Batch processing completed: ${successful} successful, ${failed} failed`);

    return {
      success: true,
      total: results.length,
      successful,
      failed,
      results,
      timestamp: new Date().toISOString()
    };
  }

  // Custom field rules management
  addCustomExtractionRule(fieldName, rule) {
    return this.fieldExtractor.addCustomRule(fieldName, rule);
  }

  // Portal form structure verification
  async verifyPortalForm(formType = 'default') {
    try {
      return await this.portalAutomation.verifyFormStructure(formType);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default PipelineService;
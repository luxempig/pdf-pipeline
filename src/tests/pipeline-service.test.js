import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import PipelineService from '../services/pipeline-service.js';
import path from 'path';
import fs from 'fs-extra';

// Mock the heavy dependencies
jest.mock('../portal/portal-automation.js', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(true),
    submitExtractedData: jest.fn().mockResolvedValue({
      success: true,
      submissionId: 'test-123',
      message: 'Mock submission successful'
    }),
    healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
    close: jest.fn().mockResolvedValue(true)
  }));
});

describe('PipelineService', () => {
  let pipelineService;
  let testFilePath;

  beforeEach(async () => {
    pipelineService = new PipelineService();
    await pipelineService.initialize();

    // Create a test PDF file for testing
    testFilePath = path.join('uploads', 'test.pdf');
    await fs.ensureDir('uploads');
    
    // Create a minimal PDF structure for testing
    const pdfHeader = '%PDF-1.4\n';
    const pdfContent = `1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Test PDF Content) Tj
ET
endstream
endobj

xref
0 5
0000000000 65535 f 
0000000015 00000 n 
0000000074 00000 n 
0000000120 00000 n 
0000000179 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
274
%%EOF`;
    
    await fs.writeFile(testFilePath, pdfHeader + pdfContent);
  });

  afterEach(async () => {
    await pipelineService.cleanup();
    if (await fs.pathExists(testFilePath)) {
      await fs.remove(testFilePath);
    }
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      expect(pipelineService.isInitialized).toBe(true);
    });

    test('should have all required components', () => {
      expect(pipelineService.pdfProcessor).toBeDefined();
      expect(pipelineService.emailProcessor).toBeDefined();
      expect(pipelineService.fieldExtractor).toBeDefined();
      expect(pipelineService.portalAutomation).toBeDefined();
    });
  });

  describe('Processor Selection', () => {
    test('should select PDF processor for .pdf files', async () => {
      const processor = await pipelineService.selectProcessor('test.pdf');
      expect(processor).toBe(pipelineService.pdfProcessor);
    });

    test('should select email processor for .eml files', async () => {
      // Create test email file
      const emlPath = path.join('uploads', 'test.eml');
      const emlContent = `From: sender@example.com
To: recipient@example.com
Subject: Test Email
Date: Mon, 1 Jan 2024 12:00:00 +0000

This is a test email body.`;
      
      await fs.writeFile(emlPath, emlContent);
      
      try {
        const processor = await pipelineService.selectProcessor(emlPath);
        expect(processor).toBe(pipelineService.emailProcessor);
      } finally {
        await fs.remove(emlPath);
      }
    });

    test('should throw error for unsupported file types', async () => {
      await expect(pipelineService.selectProcessor('test.txt'))
        .rejects.toThrow('Unsupported file extension');
    });
  });

  describe('Document Processing', () => {
    test('should process PDF document successfully', async () => {
      const result = await pipelineService.processDocument(testFilePath);
      
      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.documentType).toBe('pdf');
      expect(result.extractedFields).toBeDefined();
      expect(result.summary).toBeDefined();
    }, 10000); // Longer timeout for PDF processing

    test('should handle processing errors gracefully', async () => {
      const result = await pipelineService.processDocument('nonexistent.pdf');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.sessionId).toBeDefined();
    });

    test('should apply custom options during processing', async () => {
      const options = {
        sessionId: 'custom-session-123',
        enableLLMFallback: false,
        confidenceThreshold: 0.8
      };

      const result = await pipelineService.processDocument(testFilePath, options);
      
      expect(result.sessionId).toBe('custom-session-123');
      expect(result.success).toBe(true);
    });
  });

  describe('Portal Submission', () => {
    test('should submit to portal successfully', async () => {
      const fields = {
        email: [{ value: 'test@example.com', confidence: 0.9 }],
        phone: [{ value: '555-123-4567', confidence: 0.8 }]
      };

      const result = await pipelineService.submitToPortal('test-session', fields);
      
      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('test-session');
      expect(result.submissionId).toBeDefined();
    });

    test('should handle dry run mode', async () => {
      const fields = {
        email: [{ value: 'test@example.com', confidence: 0.9 }]
      };

      const result = await pipelineService.submitToPortal('test-session', fields, { 
        dryRun: true 
      });
      
      expect(result.dryRun).toBe(true);
      expect(result.success).toBe(true);
    });

    test('should format fields correctly for portal', () => {
      const extractedFields = {
        email: [
          { value: 'primary@example.com', confidence: 0.9 },
          { value: 'secondary@example.com', confidence: 0.7 }
        ],
        phone: [{ value: '555-123-4567', confidence: 0.8 }]
      };

      const formatted = pipelineService.formatFieldsForPortal(extractedFields);
      
      expect(formatted.email).toBe('primary@example.com'); // Should use best match
      expect(formatted.phone).toBe('555-123-4567');
    });
  });

  describe('Health Checks', () => {
    test('should return extractor health status', async () => {
      const health = await pipelineService.getExtractorHealth();
      expect(health.status).toBeDefined();
    });

    test('should return portal health status', async () => {
      const health = await pipelineService.getPortalHealth();
      expect(health.status).toBe('healthy');
    });
  });

  describe('Batch Processing', () => {
    test('should process multiple documents in batch', async () => {
      // Create multiple test files
      const testFiles = [];
      for (let i = 0; i < 3; i++) {
        const filePath = path.join('uploads', `test${i}.pdf`);
        await fs.copy(testFilePath, filePath);
        testFiles.push(filePath);
      }

      try {
        const result = await pipelineService.processBatch(testFiles, {
          concurrency: 2
        });

        expect(result.success).toBe(true);
        expect(result.total).toBe(3);
        expect(result.results).toHaveLength(3);

      } finally {
        // Clean up test files
        for (const file of testFiles) {
          await fs.remove(file);
        }
      }
    }, 15000); // Longer timeout for batch processing
  });

  describe('End-to-End Processing', () => {
    test('should handle complete process and submit workflow', async () => {
      const result = await pipelineService.processAndSubmit(testFilePath, {
        autoSubmit: false // Don't auto-submit for testing
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.processing).toBeDefined();
      expect(result.processing.success).toBe(true);
      expect(result.requiresReview).toBeDefined();
    });
  });

  describe('Cost Tracking', () => {
    test('should provide cost information', async () => {
      const costInfo = await pipelineService.getCostInfo('test-session');
      expect(costInfo.session).toBeDefined();
      expect(costInfo.daily).toBeDefined();
    });
  });
});
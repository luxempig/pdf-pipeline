# PDF Pipeline - Usage Examples

This document provides detailed examples of how to use the PDF Pipeline system in various scenarios.

## 📋 Table of Contents

- [Basic Usage Examples](#basic-usage-examples)
- [API Integration Examples](#api-integration-examples)
- [Custom Rules Examples](#custom-rules-examples)
- [Portal Integration Examples](#portal-integration-examples)
- [Batch Processing Examples](#batch-processing-examples)
- [Error Handling Examples](#error-handling-examples)

## Basic Usage Examples

### Example 1: Processing an Invoice PDF

**Input Document** (`invoice.pdf`):
```
INVOICE #INV-2024-001

Bill To:
John Doe
john.doe@company.com
Phone: (555) 123-4567

Acme Corporation
123 Business St
City, ST 12345

Amount Due: $1,234.56
Due Date: January 15, 2024
```

**Code**:
```javascript
import PipelineService from './src/services/pipeline-service.js';

const pipeline = new PipelineService();
await pipeline.initialize();

const result = await pipeline.processDocument('./uploads/invoice.pdf', {
  enableLLMFallback: true,
  confidenceThreshold: 0.6
});

console.log('Extracted Fields:', result.extractedFields);
```

**Expected Output**:
```javascript
{
  "success": true,
  "sessionId": "abc123...",
  "extractedFields": {
    "email": [
      { "value": "john.doe@company.com", "confidence": 0.95, "source": "rules" }
    ],
    "phone": [
      { "value": "5551234567", "confidence": 0.88, "source": "rules" }
    ],
    "name": [
      { "value": "John Doe", "confidence": 0.82, "source": "rules" }
    ],
    "company": [
      { "value": "Acme Corporation", "confidence": 0.79, "source": "rules" }
    ],
    "amount": [
      { "value": "1,234.56", "confidence": 0.92, "source": "rules" }
    ],
    "date": [
      { "value": "January 15, 2024", "confidence": 0.85, "source": "rules" }
    ],
    "invoiceNumber": [
      { "value": "INV-2024-001", "confidence": 0.96, "source": "rules" }
    ]
  },
  "summary": {
    "fieldsExtracted": 7,
    "extractionRate": 0.875,
    "averageConfidence": 0.88
  }
}
```

### Example 2: Processing Email (.eml)

**Input Email** (`support-request.eml`):
```
From: customer@example.com
To: support@company.com
Subject: Urgent Support Request - Account #12345
Date: Mon, 1 Jan 2024 10:30:00 -0500

Hello Support Team,

I need help with my account. Please contact me at:
- Phone: +1 (555) 987-6543
- Email: customer@example.com

The issue involves a transaction of $89.99 from December 30, 2023.

Best regards,
Sarah Johnson
ABC Solutions Inc.
```

**Code**:
```javascript
const result = await pipeline.processDocument('./uploads/support-request.eml');

console.log('Email Processing Result:');
console.log('Subject:', result.metadata.subject);
console.log('From:', result.metadata.from);
console.log('Extracted Fields:', result.extractedFields);
```

**Expected Output**:
```javascript
{
  "extractedFields": {
    "email": [
      { "value": "customer@example.com", "confidence": 0.97 }
    ],
    "phone": [
      { "value": "5559876543", "confidence": 0.91 }
    ],
    "name": [
      { "value": "Sarah Johnson", "confidence": 0.84 }
    ],
    "company": [
      { "value": "ABC Solutions Inc.", "confidence": 0.86 }
    ],
    "amount": [
      { "value": "89.99", "confidence": 0.89 }
    ],
    "date": [
      { "value": "December 30, 2023", "confidence": 0.83 }
    ]
  }
}
```

## API Integration Examples

### Example 3: REST API Integration

**Express.js Integration**:
```javascript
import express from 'express';
import PipelineService from './src/services/pipeline-service.js';

const app = express();
const pipeline = new PipelineService();

app.use(express.json());

// Process uploaded document
app.post('/api/documents/process', async (req, res) => {
  try {
    const { filePath, options = {} } = req.body;
    
    const result = await pipeline.processDocument(filePath, {
      enableLLMFallback: options.enableLLM !== false,
      confidenceThreshold: options.threshold || 0.6,
      specificFields: options.fields
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit to portal
app.post('/api/documents/:sessionId/submit', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { fields, dryRun = false } = req.body;

    const result = await pipeline.submitToPortal(sessionId, fields, { 
      dryRun,
      formType: req.body.formType || 'default'
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000);
```

**Client Usage**:
```bash
# Process document
curl -X POST http://localhost:3000/api/documents/process \\
  -H "Content-Type: application/json" \\
  -d '{
    "filePath": "/path/to/document.pdf",
    "options": {
      "enableLLM": true,
      "threshold": 0.7,
      "fields": ["email", "phone", "amount"]
    }
  }'

# Submit to portal
curl -X POST http://localhost:3000/api/documents/session123/submit \\
  -H "Content-Type: application/json" \\
  -d '{
    "fields": {
      "email": [{"value": "john@example.com", "confidence": 0.9}],
      "amount": [{"value": "1000.00", "confidence": 0.85}]
    },
    "dryRun": false,
    "formType": "invoice"
  }'
```

## Custom Rules Examples

### Example 4: Adding Custom Extraction Rules

**Scenario**: Extract custom order numbers with format "ORD-YYYY-NNNN"

```javascript
// Add custom rule for order numbers
pipeline.addCustomExtractionRule('orderNumber', {
  patterns: [
    /(?:order[:\s#]+)(ORD-\d{4}-\d{4})/gi,
    /(?:ref[:\s#]+)(ORD-\d{4}-\d{4})/gi,
    /(ORD-\d{4}-\d{4})/g
  ],
  validators: [
    (value) => value.startsWith('ORD-'),
    (value) => value.length === 13,
    (value) => /ORD-\d{4}-\d{4}/.test(value)
  ],
  priority: 1
});

// Process document with custom rule
const result = await pipeline.processDocument('./document.pdf', {
  specificFields: ['email', 'orderNumber']
});

console.log('Order Number:', result.extractedFields.orderNumber);
```

**Example 5: Product Code Extraction**

```javascript
// Extract product codes like "PROD-ABC-123"
pipeline.addCustomExtractionRule('productCode', {
  patterns: [
    /(?:product[:\s#]+)(PROD-[A-Z]{3}-\d{3})/gi,
    /(?:item[:\s#]+)(PROD-[A-Z]{3}-\d{3})/gi,
    /\b(PROD-[A-Z]{3}-\d{3})\b/g
  ],
  validators: [
    (value) => value.startsWith('PROD-'),
    (value) => /PROD-[A-Z]{3}-\d{3}/.test(value)
  ],
  priority: 2
});

// Extract warranty periods
pipeline.addCustomExtractionRule('warranty', {
  patterns: [
    /warranty[:\s]+(\d+)\s*(?:year|yr|month|mo)/gi,
    /guaranteed\s+for[:\s]+(\d+)\s*(?:year|yr|month|mo)/gi
  ],
  validators: [
    (value) => parseInt(value) > 0,
    (value) => parseInt(value) <= 10
  ],
  priority: 3
});
```

## Portal Integration Examples

### Example 6: Custom Portal Form Mapping

**Scenario**: Integrate with a custom CRM portal

```javascript
// Extend PortalAutomation for custom portal
class CustomCRMAutomation extends PortalAutomation {
  async navigateToSubmissionForm(formType) {
    const formUrls = {
      'customer': '/crm/customers/new',
      'order': '/crm/orders/create',
      'invoice': '/crm/invoicing/new'
    };

    const formUrl = formUrls[formType] || formUrls['customer'];
    await this.page.goto(`${this.baseUrl}${formUrl}`);
    
    // Wait for CRM form to load
    await this.page.waitForSelector('.crm-form-container');
    
    return { success: true };
  }

  async fillForm(extractedFields, dryRun) {
    const fieldMappings = {
      'email': ['#customer_email', 'input[data-field="email"]'],
      'phone': ['#customer_phone', 'input[data-field="phone"]'],
      'name': ['#customer_name', 'input[data-field="full_name"]'],
      'company': ['#company_name', 'select[name="company"] option:has-text("{{value}}")'],
      'amount': ['#transaction_amount', 'input[data-field="amount"]'],
      'date': ['#transaction_date', 'input[type="date"]']
    };

    // Custom filling logic for complex fields
    for (const [fieldName, matches] of Object.entries(extractedFields)) {
      if (!matches || matches.length === 0) continue;

      const value = matches[0].value;
      
      if (fieldName === 'company') {
        // Handle dropdown selection
        await this.page.selectOption('select[name="company"]', { label: value });
      } else if (fieldName === 'date') {
        // Convert date format for date picker
        const formattedDate = this.formatDateForForm(value);
        await this.page.fill('input[type="date"]', formattedDate);
      } else {
        // Standard field filling
        const selectors = fieldMappings[fieldName] || [];
        for (const selector of selectors) {
          const element = await this.page.$(selector);
          if (element) {
            await element.fill(value);
            break;
          }
        }
      }
    }

    return { success: true, filledFields: Object.keys(extractedFields) };
  }

  formatDateForForm(dateString) {
    try {
      const date = new Date(dateString);
      return date.toISOString().split('T')[0]; // YYYY-MM-DD format
    } catch {
      return dateString;
    }
  }
}

// Use custom portal automation
const customPipeline = new PipelineService();
customPipeline.portalAutomation = new CustomCRMAutomation();
await customPipeline.initialize();
```

### Example 7: Multi-step Portal Submission

```javascript
class MultiStepPortalAutomation extends PortalAutomation {
  async submitExtractedData(extractedFields, options) {
    try {
      // Step 1: Login
      await this.login();
      
      // Step 2: Navigate to customer creation
      await this.navigateToCustomerForm();
      await this.fillCustomerData(extractedFields);
      const customerId = await this.submitCustomerForm();
      
      // Step 3: Navigate to order creation
      await this.navigateToOrderForm();
      await this.fillOrderData(extractedFields, customerId);
      const orderId = await this.submitOrderForm();
      
      // Step 4: Upload supporting document
      await this.uploadSupportingDocument(options.originalFile);

      return {
        success: true,
        customerId,
        orderId,
        message: 'Multi-step submission completed'
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async navigateToCustomerForm() {
    await this.page.click('nav [data-menu="customers"]');
    await this.page.click('button:has-text("Add Customer")');
    await this.page.waitForSelector('.customer-form');
  }

  async submitCustomerForm() {
    await this.page.click('button[type="submit"]:has-text("Create Customer")');
    await this.page.waitForSelector('.success-notification');
    
    // Extract customer ID from success message
    const successText = await this.page.textContent('.success-notification');
    const match = successText.match(/Customer #(\d+) created/);
    return match ? match[1] : null;
  }
}
```

## Batch Processing Examples

### Example 8: Processing Multiple Documents

```javascript
import path from 'path';
import fs from 'fs-extra';

async function processBulkDocuments() {
  const pipeline = new PipelineService();
  await pipeline.initialize();

  // Get all PDFs from directory
  const documentsDir = './batch-documents';
  const files = await fs.readdir(documentsDir);
  const pdfFiles = files
    .filter(file => file.endsWith('.pdf'))
    .map(file => path.join(documentsDir, file));

  console.log(`Processing ${pdfFiles.length} documents...`);

  // Process in batches of 5
  const results = await pipeline.processBatch(pdfFiles, {
    concurrency: 5,
    enableLLMFallback: true,
    confidenceThreshold: 0.7
  });

  console.log(`Batch Results:`);
  console.log(`Total: ${results.total}`);
  console.log(`Successful: ${results.successful}`);
  console.log(`Failed: ${results.failed}`);

  // Process successful results
  for (const result of results.results) {
    if (result.success) {
      const avgConfidence = result.summary.averageConfidence;
      
      if (avgConfidence > 0.8) {
        // Auto-submit high confidence results
        console.log(`Auto-submitting ${result.filename} (confidence: ${avgConfidence})`);
        await pipeline.submitToPortal(result.sessionId, result.extractedFields);
      } else {
        // Save for manual review
        console.log(`${result.filename} needs manual review (confidence: ${avgConfidence})`);
        await saveForReview(result);
      }
    }
  }
}

async function saveForReview(result) {
  const reviewData = {
    filename: result.filename,
    sessionId: result.sessionId,
    extractedFields: result.extractedFields,
    recommendations: result.summary.recommendedReview,
    reviewUrl: `http://localhost:3000/review/${result.sessionId}`
  };

  await fs.writeJson(`./reviews/${result.sessionId}.json`, reviewData, { spaces: 2 });
}

processBulkDocuments().catch(console.error);
```

### Example 9: Automated Document Workflow

```javascript
import { watch } from 'fs';
import path from 'path';

class DocumentWatcher {
  constructor(pipelineService) {
    this.pipeline = pipelineService;
    this.watchDir = './incoming';
    this.processedDir = './processed';
    this.errorDir = './error';
  }

  start() {
    console.log(`Watching ${this.watchDir} for new documents...`);

    watch(this.watchDir, { recursive: true }, (eventType, filename) => {
      if (eventType === 'rename' && this.isValidDocument(filename)) {
        this.processNewDocument(filename);
      }
    });
  }

  isValidDocument(filename) {
    const validExtensions = ['.pdf', '.eml', '.msg'];
    return validExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  }

  async processNewDocument(filename) {
    const filePath = path.join(this.watchDir, filename);
    
    try {
      console.log(`Processing new document: ${filename}`);

      // Process document
      const result = await this.pipeline.processDocument(filePath, {
        enableLLMFallback: true,
        confidenceThreshold: 0.6
      });

      if (result.success) {
        const avgConfidence = result.summary.averageConfidence;
        
        if (avgConfidence >= 0.8) {
          // High confidence - auto submit
          const submission = await this.pipeline.submitToPortal(
            result.sessionId,
            result.extractedFields,
            { dryRun: false }
          );

          if (submission.success) {
            console.log(`✅ Auto-submitted: ${filename}`);
            await this.moveToProcessed(filePath, `auto_${filename}`);
          } else {
            console.log(`❌ Submission failed: ${filename}`);
            await this.moveToError(filePath, `submit_failed_${filename}`);
          }
        } else {
          // Low confidence - save for review
          console.log(`⚠️ Manual review needed: ${filename} (confidence: ${avgConfidence.toFixed(2)})`);
          await this.saveForManualReview(result, filePath);
        }
      } else {
        console.log(`❌ Processing failed: ${filename} - ${result.error}`);
        await this.moveToError(filePath, `process_failed_${filename}`);
      }

    } catch (error) {
      console.error(`Error processing ${filename}:`, error);
      await this.moveToError(filePath, `error_${filename}`);
    }
  }

  async moveToProcessed(filePath, newName) {
    const destPath = path.join(this.processedDir, newName);
    await fs.move(filePath, destPath);
  }

  async moveToError(filePath, newName) {
    const destPath = path.join(this.errorDir, newName);
    await fs.move(filePath, destPath);
  }

  async saveForManualReview(result, originalPath) {
    // Move original file
    const reviewFileName = `review_${result.filename}`;
    await this.moveToProcessed(originalPath, reviewFileName);

    // Save review data
    const reviewData = {
      ...result,
      reviewUrl: `http://localhost:3000/review/${result.sessionId}`,
      originalFile: reviewFileName
    };

    await fs.writeJson(
      path.join(this.processedDir, `${result.sessionId}.json`),
      reviewData,
      { spaces: 2 }
    );
  }
}

// Usage
const pipeline = new PipelineService();
await pipeline.initialize();

const watcher = new DocumentWatcher(pipeline);
watcher.start();
```

## Error Handling Examples

### Example 10: Comprehensive Error Handling

```javascript
async function robustDocumentProcessing(filePath) {
  const pipeline = new PipelineService();
  
  try {
    await pipeline.initialize();
    
    // Health check before processing
    const extractorHealth = await pipeline.getExtractorHealth();
    const portalHealth = await pipeline.getPortalHealth();
    
    if (extractorHealth.status !== 'healthy') {
      throw new Error(`Extractor unhealthy: ${extractorHealth.error}`);
    }
    
    // Process with retry logic
    const result = await retryOperation(
      () => pipeline.processDocument(filePath, {
        enableLLMFallback: true,
        confidenceThreshold: 0.6
      }),
      3, // max retries
      1000 // delay between retries
    );

    if (!result.success) {
      throw new Error(`Processing failed: ${result.error}`);
    }

    // Validate extraction results
    const validationErrors = validateExtractionResults(result.extractedFields);
    if (validationErrors.length > 0) {
      console.warn('Validation warnings:', validationErrors);
    }

    // Check cost limits before LLM usage
    const costInfo = await pipeline.getCostInfo(result.sessionId);
    if (costInfo.daily.totalCost > 5.00) { // $5 daily limit
      throw new Error('Daily cost limit exceeded');
    }

    // Submit with portal health check
    if (portalHealth.status === 'healthy') {
      const submission = await pipeline.submitToPortal(
        result.sessionId,
        result.extractedFields,
        { dryRun: false }
      );

      return {
        success: true,
        processing: result,
        submission: submission,
        costInfo: costInfo
      };
    } else {
      console.warn('Portal unhealthy, skipping submission');
      return {
        success: true,
        processing: result,
        submission: { success: false, reason: 'Portal unavailable' },
        requiresManualSubmission: true
      };
    }

  } catch (error) {
    console.error('Document processing error:', error);
    
    // Log error details
    const errorDetails = {
      timestamp: new Date().toISOString(),
      filePath: filePath,
      error: error.message,
      stack: error.stack
    };

    await fs.appendFile('logs/processing-errors.log', 
      JSON.stringify(errorDetails) + '\\n'
    );

    return {
      success: false,
      error: error.message,
      timestamp: errorDetails.timestamp
    };
    
  } finally {
    await pipeline.cleanup();
  }
}

async function retryOperation(operation, maxRetries, delay) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.warn(`Attempt ${attempt} failed:`, error.message);
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }
  
  throw lastError;
}

function validateExtractionResults(extractedFields) {
  const warnings = [];
  
  // Check for required fields
  const requiredFields = ['email', 'name'];
  for (const field of requiredFields) {
    if (!extractedFields[field] || extractedFields[field].length === 0) {
      warnings.push(`Required field missing: ${field}`);
    }
  }
  
  // Check confidence levels
  for (const [fieldName, matches] of Object.entries(extractedFields)) {
    if (matches && matches.length > 0) {
      const bestMatch = matches[0];
      if (bestMatch.confidence < 0.5) {
        warnings.push(`Low confidence for ${fieldName}: ${bestMatch.confidence}`);
      }
    }
  }
  
  return warnings;
}

// Usage
robustDocumentProcessing('./uploads/document.pdf')
  .then(result => {
    if (result.success) {
      console.log('✅ Processing completed successfully');
    } else {
      console.log('❌ Processing failed:', result.error);
    }
  });
```

These examples demonstrate the flexibility and power of the PDF Pipeline system. You can adapt and extend these patterns to fit your specific use case and requirements.
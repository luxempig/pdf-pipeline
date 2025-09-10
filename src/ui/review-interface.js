import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ReviewInterface {
  constructor(pipelineService) {
    this.pipelineService = pipelineService;
    this.sessions = new Map(); // Store review sessions
    this.setupRoutes();
  }

  setupRoutes() {
    this.router = express.Router();

    // Serve static files (CSS, JS)
    this.router.use('/static', express.static(path.join(__dirname, 'static')));

    // File upload endpoint
    this.router.post('/upload', this.setupFileUpload(), this.handleUpload.bind(this));

    // Review interface
    this.router.get('/review/:sessionId', this.handleReviewPage.bind(this));

    // API endpoints
    this.router.get('/api/sessions/:sessionId', this.getSession.bind(this));
    this.router.put('/api/sessions/:sessionId/fields', this.updateFields.bind(this));
    this.router.post('/api/sessions/:sessionId/submit', this.submitToPortal.bind(this));
    this.router.delete('/api/sessions/:sessionId', this.deleteSession.bind(this));

    // Health check
    this.router.get('/health', this.healthCheck.bind(this));
  }

  setupFileUpload() {
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, 'uploads/');
      },
      filename: (req, file, cb) => {
        const timestamp = Date.now();
        const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${timestamp}_${originalName}`);
      }
    });

    return multer({ 
      storage,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['application/pdf', 'message/rfc822', 'text/plain'];
        const allowedExtensions = ['.pdf', '.eml', '.msg', '.txt'];
        
        const hasValidMimeType = allowedTypes.includes(file.mimetype);
        const hasValidExtension = allowedExtensions.some(ext => 
          file.originalname.toLowerCase().endsWith(ext)
        );

        if (hasValidMimeType || hasValidExtension) {
          cb(null, true);
        } else {
          cb(new Error('Invalid file type. Only PDF and email files are allowed.'));
        }
      }
    }).single('document');
  }

  async handleUpload(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      logger.info(`File uploaded: ${req.file.filename}`);

      // Process the document through the pipeline
      const result = await this.pipelineService.processDocument(req.file.path, {
        sessionId: req.body.sessionId || this.generateSessionId(),
        enableLLMFallback: req.body.enableLLM !== 'false',
        confidenceThreshold: parseFloat(req.body.confidenceThreshold) || 0.6
      });

      // Store session data
      this.sessions.set(result.sessionId, {
        ...result,
        uploadedFile: req.file,
        createdAt: new Date(),
        lastModified: new Date(),
        status: 'review_pending'
      });

      res.json({
        success: true,
        sessionId: result.sessionId,
        redirectUrl: `/review/${result.sessionId}`
      });

    } catch (error) {
      logger.error('Upload processing failed:', error);
      res.status(500).json({ 
        error: 'Processing failed', 
        details: error.message 
      });
    }
  }

  async handleReviewPage(req, res) {
    try {
      const sessionId = req.params.sessionId;
      const session = this.sessions.get(sessionId);

      if (!session) {
        return res.status(404).send('Session not found');
      }

      const html = this.generateReviewHTML(session);
      res.send(html);

    } catch (error) {
      logger.error('Review page error:', error);
      res.status(500).send('Internal server error');
    }
  }

  generateReviewHTML(session) {
    const { extractedFields, summary, metadata } = session;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document Review - ${session.filename}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { padding: 20px; border-bottom: 1px solid #eee; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; }
        .summary { background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 20px; }
        .fields-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .field-card { border: 1px solid #ddd; border-radius: 6px; padding: 15px; background: white; }
        .field-label { font-weight: bold; color: #333; margin-bottom: 8px; }
        .field-input { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        .confidence-bar { height: 4px; background: #e0e0e0; border-radius: 2px; margin-top: 5px; overflow: hidden; }
        .confidence-fill { height: 100%; background: linear-gradient(to right, #ff4444, #ffaa00, #44ff44); transition: width 0.3s; }
        .alternatives { margin-top: 10px; }
        .alternative { background: #f0f0f0; padding: 5px 8px; margin: 2px; border-radius: 3px; cursor: pointer; display: inline-block; font-size: 12px; }
        .alternative:hover { background: #e0e0e0; }
        .recommendations { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; margin-bottom: 20px; }
        .rec-item { margin-bottom: 8px; padding: 8px; border-radius: 4px; }
        .rec-high { background: #f8d7da; }
        .rec-medium { background: #fff3cd; }
        .rec-low { background: #d1ecf1; }
        .actions { text-align: center; padding: 20px; border-top: 1px solid #eee; }
        .btn { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; margin: 0 5px; }
        .btn-primary { background: #007bff; color: white; }
        .btn-success { background: #28a745; color: white; }
        .btn-secondary { background: #6c757d; color: white; }
        .loading { display: none; text-align: center; padding: 20px; }
        .hidden { display: none; }
        .toast { position: fixed; top: 20px; right: 20px; padding: 15px; border-radius: 6px; color: white; font-weight: bold; z-index: 1000; }
        .toast-success { background: #28a745; }
        .toast-error { background: #dc3545; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Document Review</h1>
            <p>File: ${session.uploadedFile.originalname} | Type: ${session.documentType} | Session: ${session.sessionId}</p>
        </div>

        <div class="content">
            <!-- Summary Section -->
            <div class="summary">
                <h3>Extraction Summary</h3>
                <p><strong>Fields Extracted:</strong> ${summary.fieldsExtracted}/${summary.totalFieldsRequested}</p>
                <p><strong>Extraction Rate:</strong> ${(summary.extractionRate * 100).toFixed(1)}%</p>
                <p><strong>Average Confidence:</strong> ${(summary.averageConfidence * 100).toFixed(1)}%</p>
                <p><strong>Method:</strong> ${metadata.extractionMethod}</p>
                ${metadata.llmFallbackUsed ? '<p><strong>LLM Fallback:</strong> Used for low-confidence fields</p>' : ''}
            </div>

            <!-- Recommendations -->
            ${this.generateRecommendationsHTML(summary.recommendedReview)}

            <!-- Fields Section -->
            <div class="fields-grid">
                ${this.generateFieldsHTML(extractedFields)}
            </div>

            <!-- Actions -->
            <div class="actions">
                <button class="btn btn-secondary" onclick="saveProgress()">Save Progress</button>
                <button class="btn btn-primary" onclick="validateFields()">Validate All</button>
                <button class="btn btn-success" onclick="submitToPortal()">Submit to Portal</button>
            </div>

            <div class="loading" id="loading">
                <p>Processing... Please wait.</p>
            </div>
        </div>
    </div>

    <script>
        const sessionId = '${session.sessionId}';
        const fieldsData = ${JSON.stringify(extractedFields)};
        
        function updateField(fieldName, value) {
            fieldsData[fieldName] = [{
                value: value,
                confidence: 1.0,
                source: 'user_edit'
            }];
            
            // Update confidence bar
            const confidenceBar = document.querySelector('#field-' + fieldName + ' .confidence-fill');
            if (confidenceBar) {
                confidenceBar.style.width = '100%';
            }
        }

        function selectAlternative(fieldName, value) {
            const input = document.getElementById('input-' + fieldName);
            if (input) {
                input.value = value;
                updateField(fieldName, value);
                showToast('Alternative selected', 'success');
            }
        }

        async function saveProgress() {
            showLoading(true);
            try {
                const response = await fetch('/api/sessions/' + sessionId + '/fields', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fields: fieldsData })
                });
                
                if (response.ok) {
                    showToast('Progress saved', 'success');
                } else {
                    throw new Error('Failed to save');
                }
            } catch (error) {
                showToast('Save failed: ' + error.message, 'error');
            }
            showLoading(false);
        }

        async function validateFields() {
            showLoading(true);
            let errors = [];
            
            // Client-side validation
            for (const [fieldName, matches] of Object.entries(fieldsData)) {
                if (!matches || matches.length === 0) {
                    errors.push(fieldName + ' is required');
                }
            }

            if (errors.length > 0) {
                showToast('Validation errors: ' + errors.join(', '), 'error');
            } else {
                showToast('All fields validated successfully', 'success');
            }
            
            showLoading(false);
        }

        async function submitToPortal() {
            if (!confirm('Are you sure you want to submit to the portal?')) {
                return;
            }

            showLoading(true);
            try {
                const response = await fetch('/api/sessions/' + sessionId + '/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        fields: fieldsData,
                        dryRun: false 
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showToast('Successfully submitted to portal!', 'success');
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 2000);
                } else {
                    throw new Error(result.error || 'Submission failed');
                }
            } catch (error) {
                showToast('Submission failed: ' + error.message, 'error');
            }
            showLoading(false);
        }

        function showLoading(show) {
            document.getElementById('loading').style.display = show ? 'block' : 'none';
        }

        function showToast(message, type) {
            const toast = document.createElement('div');
            toast.className = 'toast toast-' + type;
            toast.textContent = message;
            document.body.appendChild(toast);
            
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 3000);
        }

        // Auto-save on input changes
        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('field-input')) {
                const fieldName = e.target.dataset.field;
                updateField(fieldName, e.target.value);
            }
        });
    </script>
</body>
</html>`;
  }

  generateRecommendationsHTML(recommendations) {
    if (!recommendations || recommendations.length === 0) {
      return '<div class="recommendations"><p>✅ No issues found. All fields extracted with good confidence.</p></div>';
    }

    const recItems = recommendations.map(rec => `
      <div class="rec-item rec-${rec.severity}">
        <strong>${rec.field}:</strong> ${rec.message}
        ${rec.extractedValue ? `<br><small>Current: ${rec.extractedValue}</small>` : ''}
        ${rec.alternatives ? `<br><small>Alternatives: ${rec.alternatives.join(', ')}</small>` : ''}
      </div>
    `).join('');

    return `
      <div class="recommendations">
        <h3>⚠️ Review Recommendations</h3>
        ${recItems}
      </div>
    `;
  }

  generateFieldsHTML(extractedFields) {
    const fieldLabels = {
      email: 'Email Address',
      phone: 'Phone Number',
      name: 'Full Name',
      company: 'Company/Organization',
      amount: 'Amount',
      date: 'Date',
      invoiceNumber: 'Invoice/Document Number',
      address: 'Address'
    };

    return Object.entries(fieldLabels).map(([fieldName, label]) => {
      const matches = extractedFields[fieldName] || [];
      const bestMatch = matches[0];
      const confidence = bestMatch ? bestMatch.confidence : 0;
      
      const alternatives = matches.slice(1, 4).map(match => 
        `<span class="alternative" onclick="selectAlternative('${fieldName}', '${match.value.replace(/'/g, "\\\'")}')">${match.value}</span>`
      ).join('');

      return `
        <div class="field-card" id="field-${fieldName}">
          <div class="field-label">${label}</div>
          <input 
            type="text" 
            class="field-input" 
            data-field="${fieldName}"
            id="input-${fieldName}"
            value="${bestMatch ? bestMatch.value : ''}"
            placeholder="Enter ${label.toLowerCase()}"
          />
          <div class="confidence-bar">
            <div class="confidence-fill" style="width: ${confidence * 100}%"></div>
          </div>
          <small>Confidence: ${(confidence * 100).toFixed(1)}%</small>
          ${alternatives ? `<div class="alternatives"><strong>Alternatives:</strong> ${alternatives}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  async getSession(req, res) {
    const sessionId = req.params.sessionId;
    const session = this.sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);
  }

  async updateFields(req, res) {
    try {
      const sessionId = req.params.sessionId;
      const { fields } = req.body;
      const session = this.sessions.get(sessionId);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Update the session with new field values
      session.extractedFields = fields;
      session.lastModified = new Date();
      session.status = 'user_modified';

      this.sessions.set(sessionId, session);

      res.json({ success: true, message: 'Fields updated successfully' });

    } catch (error) {
      logger.error('Update fields error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async submitToPortal(req, res) {
    try {
      const sessionId = req.params.sessionId;
      const { fields, dryRun = false } = req.body;
      const session = this.sessions.get(sessionId);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Submit to portal through the pipeline service
      const result = await this.pipelineService.submitToPortal(sessionId, fields, { dryRun });

      // Update session status
      session.status = result.success ? 'submitted' : 'submission_failed';
      session.submissionResult = result;
      session.lastModified = new Date();

      this.sessions.set(sessionId, session);

      res.json(result);

    } catch (error) {
      logger.error('Portal submission error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async deleteSession(req, res) {
    const sessionId = req.params.sessionId;
    
    if (this.sessions.delete(sessionId)) {
      res.json({ success: true, message: 'Session deleted' });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  }

  async healthCheck(req, res) {
    res.json({
      status: 'healthy',
      activeSessions: this.sessions.size,
      timestamp: new Date().toISOString()
    });
  }

  generateSessionId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  getRouter() {
    return this.router;
  }

  // Clean up old sessions periodically
  startSessionCleanup(maxAgeHours = 24) {
    setInterval(() => {
      const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
      
      for (const [sessionId, session] of this.sessions.entries()) {
        if (session.createdAt < cutoff) {
          this.sessions.delete(sessionId);
          logger.info(`Cleaned up expired session: ${sessionId}`);
        }
      }
    }, 60 * 60 * 1000); // Check every hour
  }
}

export default ReviewInterface;
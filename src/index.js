import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/index.js';
import logger from './utils/logger.js';
import PipelineService from './services/pipeline-service.js';
import ReviewInterface from './ui/review-interface.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PDFPipelineServer {
  constructor() {
    this.app = express();
    this.pipelineService = new PipelineService();
    this.reviewInterface = new ReviewInterface(this.pipelineService);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Body parsing
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });

    // Security headers
    this.app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      next();
    });
  }

  setupRoutes() {
    // Home page
    this.app.get('/', (req, res) => {
      res.send(this.generateHomePage());
    });

    // API routes
    this.app.use('/api', this.createAPIRouter());

    // Review interface routes
    this.app.use('/', this.reviewInterface.getRouter());

    // Health check
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.getSystemHealth();
        res.json(health);
      } catch (error) {
        res.status(500).json({ status: 'unhealthy', error: error.message });
      }
    });
  }

  createAPIRouter() {
    const router = express.Router();

    // Process document directly (without UI)
    router.post('/process', async (req, res) => {
      try {
        const { filePath, options = {} } = req.body;
        
        if (!filePath) {
          return res.status(400).json({ error: 'filePath is required' });
        }

        const result = await this.pipelineService.processDocument(filePath, options);
        res.json(result);

      } catch (error) {
        logger.error('API process error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Submit to portal directly
    router.post('/submit', async (req, res) => {
      try {
        const { sessionId, fields, options = {} } = req.body;
        
        if (!sessionId || !fields) {
          return res.status(400).json({ error: 'sessionId and fields are required' });
        }

        const result = await this.pipelineService.submitToPortal(sessionId, fields, options);
        res.json(result);

      } catch (error) {
        logger.error('API submit error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // System status
    router.get('/status', async (req, res) => {
      try {
        const status = await this.getSystemHealth();
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }

  generateHomePage() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PDF Pipeline - Document Processing</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
        .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
        .card { background: white; border-radius: 12px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
        h1 { color: #333; text-align: center; margin-bottom: 10px; }
        .subtitle { text-align: center; color: #666; margin-bottom: 30px; }
        .upload-zone { border: 2px dashed #ddd; border-radius: 8px; padding: 40px; text-align: center; cursor: pointer; transition: all 0.3s; }
        .upload-zone:hover { border-color: #667eea; background: #f8f9ff; }
        .upload-zone.dragover { border-color: #667eea; background: #f0f2ff; }
        .file-input { display: none; }
        .upload-text { font-size: 18px; color: #666; margin-bottom: 10px; }
        .upload-subtext { font-size: 14px; color: #999; }
        .options { margin: 20px 0; }
        .option-group { margin-bottom: 15px; }
        .option-label { display: block; margin-bottom: 5px; font-weight: 500; }
        .checkbox { margin-right: 8px; }
        .btn { background: #667eea; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 16px; }
        .btn:hover { background: #5a6fd8; }
        .btn:disabled { background: #ccc; cursor: not-allowed; }
        .progress { display: none; margin-top: 20px; }
        .progress-bar { background: #eee; height: 20px; border-radius: 10px; overflow: hidden; }
        .progress-fill { background: #667eea; height: 100%; width: 0%; transition: width 0.3s; }
        .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 30px; }
        .feature { text-align: center; padding: 20px; }
        .feature-icon { font-size: 48px; margin-bottom: 10px; }
        .feature-title { font-weight: bold; margin-bottom: 5px; }
        .feature-desc { font-size: 14px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <h1>📄 PDF Pipeline</h1>
            <p class="subtitle">Upload PDFs or emails to extract key information and submit to your portal</p>
            
            <form id="uploadForm" enctype="multipart/form-data">
                <div class="upload-zone" id="uploadZone">
                    <div class="upload-text">📁 Click to select or drag & drop your file</div>
                    <div class="upload-subtext">Supports PDF, EML, MSG files (max 10MB)</div>
                    <input type="file" id="fileInput" name="document" class="file-input" accept=".pdf,.eml,.msg,.txt">
                </div>
                
                <div class="options">
                    <div class="option-group">
                        <label class="option-label">
                            <input type="checkbox" class="checkbox" name="enableLLM" checked>
                            Enable AI fallback for missing fields
                        </label>
                    </div>
                    
                    <div class="option-group">
                        <label class="option-label">Confidence Threshold:</label>
                        <select name="confidenceThreshold">
                            <option value="0.4">Low (40%)</option>
                            <option value="0.6" selected>Medium (60%)</option>
                            <option value="0.8">High (80%)</option>
                        </select>
                    </div>
                </div>
                
                <button type="submit" class="btn" id="submitBtn">Process Document</button>
                
                <div class="progress" id="progress">
                    <div class="progress-bar">
                        <div class="progress-fill" id="progressFill"></div>
                    </div>
                    <p>Processing document... Please wait.</p>
                </div>
            </form>
            
            <div class="features">
                <div class="feature">
                    <div class="feature-icon">🔍</div>
                    <div class="feature-title">Smart Extraction</div>
                    <div class="feature-desc">Rules-based extraction with AI fallback</div>
                </div>
                
                <div class="feature">
                    <div class="feature-icon">✏️</div>
                    <div class="feature-title">Review & Edit</div>
                    <div class="feature-desc">User-friendly interface to verify results</div>
                </div>
                
                <div class="feature">
                    <div class="feature-icon">🚀</div>
                    <div class="feature-title">Auto Submit</div>
                    <div class="feature-desc">Automated portal submission via browser automation</div>
                </div>
                
                <div class="feature">
                    <div class="feature-icon">💰</div>
                    <div class="feature-title">Cost Control</div>
                    <div class="feature-desc">Built-in guardrails for AI usage costs</div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const uploadForm = document.getElementById('uploadForm');
        const uploadZone = document.getElementById('uploadZone');
        const fileInput = document.getElementById('fileInput');
        const submitBtn = document.getElementById('submitBtn');
        const progress = document.getElementById('progress');
        const progressFill = document.getElementById('progressFill');

        // File upload handling
        uploadZone.addEventListener('click', () => fileInput.click());
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });
        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('dragover');
        });
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            fileInput.files = e.dataTransfer.files;
            updateUploadZone();
        });

        fileInput.addEventListener('change', updateUploadZone);

        function updateUploadZone() {
            if (fileInput.files[0]) {
                uploadZone.innerHTML = '<div class="upload-text">📄 ' + fileInput.files[0].name + '</div><div class="upload-subtext">Click to select a different file</div>';
            }
        }

        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!fileInput.files[0]) {
                alert('Please select a file');
                return;
            }

            const formData = new FormData(uploadForm);
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Processing...';
            progress.style.display = 'block';
            
            try {
                const response = await fetch('/upload', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    window.location.href = result.redirectUrl;
                } else {
                    throw new Error(result.error || 'Upload failed');
                }
                
            } catch (error) {
                alert('Error: ' + error.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Process Document';
                progress.style.display = 'none';
            }
        });

        // Simulate progress (since we don't have real-time feedback)
        function simulateProgress() {
            let width = 0;
            const interval = setInterval(() => {
                width += Math.random() * 15;
                if (width >= 90) {
                    clearInterval(interval);
                } else {
                    progressFill.style.width = width + '%';
                }
            }, 200);
        }

        uploadForm.addEventListener('submit', simulateProgress);
    </script>
</body>
</html>`;
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Route not found' });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      logger.error('Unhandled error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        ...(config.nodeEnv === 'development' && { details: error.message })
      });
    });
  }

  async getSystemHealth() {
    const [extractorHealth, portalHealth] = await Promise.all([
      this.pipelineService.getExtractorHealth(),
      this.pipelineService.getPortalHealth()
    ]);

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: config.nodeEnv,
      components: {
        extractor: extractorHealth,
        portal: portalHealth,
        server: {
          status: 'healthy',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          port: config.port
        }
      }
    };
  }

  async start() {
    try {
      // Initialize pipeline service
      await this.pipelineService.initialize();

      // Start session cleanup
      this.reviewInterface.startSessionCleanup();

      // Start server
      this.app.listen(config.port, () => {
        logger.info(`🚀 PDF Pipeline server started on port ${config.port}`);
        logger.info(`📄 Upload interface: http://localhost:${config.port}/`);
        logger.info(`🔍 Health check: http://localhost:${config.port}/health`);
        logger.info(`📊 API docs: http://localhost:${config.port}/api/status`);
      });

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async stop() {
    try {
      await this.pipelineService.cleanup();
      logger.info('PDF Pipeline server stopped');
    } catch (error) {
      logger.error('Error during shutdown:', error);
    }
  }
}

// Start the server
const server = new PDFPipelineServer();

// Graceful shutdown
process.on('SIGTERM', () => server.stop());
process.on('SIGINT', () => server.stop());

// Start the application
server.start().catch(error => {
  logger.error('Startup failed:', error);
  process.exit(1);
});

export default PDFPipelineServer;
# PDF Pipeline

A low-cost, reliable pipeline for processing PDFs and emails with automated field extraction and portal submission. Features rules-first extraction with optional LLM fallback, user review interface, and browser automation.

## 🚀 Features

- **Multi-format Support**: Process PDFs and email files (.pdf, .eml, .msg)
- **Smart Extraction**: Rules-based field extraction with AI fallback
- **Cost Controls**: Built-in guardrails for LLM usage costs  
- **User Review**: Interactive web interface for reviewing and editing extracted data
- **Portal Automation**: Automated form submission using Playwright
- **Comprehensive Logging**: Detailed logging and error tracking
- **Batch Processing**: Support for processing multiple documents
- **Health Monitoring**: Built-in health checks and monitoring

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- (Optional) Ollama for local LLM inference
- (Optional) OpenAI API key for cloud LLM

## 🔧 Installation

1. **Clone and setup**:
   ```bash
   git clone <repository-url>
   cd pdf_pipeline
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Install Playwright browsers** (for portal automation):
   ```bash
   npx playwright install
   ```

4. **Optional: Setup Ollama** (for local LLM):
   ```bash
   # Install Ollama from https://ollama.ai
   ollama pull llama3.2:3b
   ```

## ⚙️ Configuration

Edit `.env` file:

```env
# Server
PORT=3000
NODE_ENV=development

# LLM Configuration
LLM_PROVIDER=ollama  # or 'openai'
OLLAMA_BASE_URL=http://localhost:11434
OPENAI_API_KEY=your_key_here
LLM_MODEL=llama3.2:3b
MAX_LLM_COST_PER_REQUEST=0.01

# Portal Configuration  
PORTAL_BASE_URL=https://your-portal.com
PORTAL_USERNAME=your_username
PORTAL_PASSWORD=your_password

# Processing
MAX_FILE_SIZE=10485760  # 10MB
ALLOWED_FILE_TYPES=pdf,eml,msg

# Logging
LOG_LEVEL=info
LOG_FILE=logs/pipeline.log
```

## 🚀 Quick Start

### Option 1: Web Interface

1. **Start the server**:
   ```bash
   npm start
   ```

2. **Open browser**: Navigate to `http://localhost:3000`

3. **Upload document**: Drag & drop or select your PDF/email file

4. **Review results**: Edit extracted fields in the web interface

5. **Submit**: Send to your configured portal

### Option 2: API Usage

```javascript
import PipelineService from './src/services/pipeline-service.js';

const pipeline = new PipelineService();
await pipeline.initialize();

// Process document
const result = await pipeline.processDocument('/path/to/document.pdf', {
  enableLLMFallback: true,
  confidenceThreshold: 0.6
});

// Submit to portal
const submission = await pipeline.submitToPortal(
  result.sessionId, 
  result.extractedFields,
  { dryRun: false }
);
```

### Option 3: Command Line (via API)

```bash
# Process document
curl -X POST http://localhost:3000/api/process \\
  -H "Content-Type: application/json" \\
  -d '{"filePath": "/path/to/document.pdf"}'

# Submit to portal
curl -X POST http://localhost:3000/api/submit \\
  -H "Content-Type: application/json" \\
  -d '{"sessionId": "your-session-id", "fields": {...}}'
```

## 📊 Extracted Fields

The system automatically extracts common fields:

- **Personal Info**: Email, phone, name
- **Business Info**: Company name, address  
- **Financial**: Amounts, invoice numbers
- **Dates**: Various date formats
- **Custom Fields**: Add your own extraction rules

## 🔧 Advanced Configuration

### Custom Extraction Rules

```javascript
// Add custom field extraction
pipeline.addCustomExtractionRule('customField', {
  patterns: [/CUSTOM:(\w+)/g],
  validators: [(value) => value.length > 3],
  priority: 1
});
```

### Portal Form Customization

Modify `src/portal/portal-automation.js` to customize field mappings for your specific portal:

```javascript
const fieldMappings = {
  'email': ['input[name="email"]', 'input[type="email"]'],
  'phone': ['input[name="phone"]', 'input[name="phoneNumber"]'],
  // Add your portal's specific selectors
};
```

### LLM Provider Configuration

**Ollama (Local, Free)**:
```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
LLM_MODEL=llama3.2:3b
```

**OpenAI (Cloud, Paid)**:
```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your_api_key
LLM_MODEL=gpt-4o-mini
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --testPathPattern=rules-engine

# Run with coverage
npm test -- --coverage

# Watch mode during development
npm test -- --watch
```

## 📁 Project Structure

```
src/
├── config/           # Configuration management
├── processors/       # Document processors (PDF, Email)
├── rules/            # Field extraction rules
├── llm/              # LLM providers and cost tracking
├── extractors/       # Main extraction engine
├── portal/           # Browser automation
├── ui/               # Web interface
├── services/         # Core pipeline service
├── utils/            # Utilities and logging
└── tests/            # Test suites

uploads/              # File upload directory
logs/                 # Application logs
```

## 🔍 Monitoring & Debugging

### Health Checks

```bash
# System health
curl http://localhost:3000/health

# Component status  
curl http://localhost:3000/api/status
```

### Logs

- Application logs: `logs/pipeline.log`
- Error tracking: Automatic error logging with context
- Cost tracking: LLM usage costs tracked per session

### Debug Mode

```bash
NODE_ENV=development LOG_LEVEL=debug npm start
```

## 💰 Cost Management

The system includes built-in cost controls for LLM usage:

- **Per-request limits**: `MAX_LLM_COST_PER_REQUEST`
- **Daily limits**: Configurable daily spending caps
- **Usage tracking**: Detailed cost tracking per session
- **Fallback handling**: Graceful degradation when limits exceeded

## 🔧 Portal Integration

### Supported Portals

The system can be adapted to work with any web-based portal by customizing:

1. **Login selectors** in `portal-automation.js:login()`
2. **Form field mappings** in `portal-automation.js:fillForm()`
3. **Submit button selectors** in `portal-automation.js:submitForm()`

### Testing Portal Integration

```javascript
// Verify portal form structure
const verification = await pipeline.verifyPortalForm('default');
console.log(verification.formStructure);
```

## 🚨 Troubleshooting

### Common Issues

**PDF Processing Fails**:
- Ensure file is valid PDF format
- Check file size limits
- Verify file permissions

**LLM Fallback Not Working**:
- Check Ollama is running: `ollama list`
- Verify API keys for OpenAI
- Check cost limits haven't been exceeded

**Portal Submission Fails**:
- Verify portal credentials in `.env`
- Check portal URL accessibility
- Review browser automation selectors

**High Memory Usage**:
- Reduce batch processing concurrency
- Process smaller files
- Restart service periodically

### Debug Commands

```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Test portal connectivity  
curl -I https://your-portal.com

# View recent logs
tail -f logs/pipeline.log
```

## 📈 Performance Tuning

### Optimization Tips

1. **Batch Processing**: Use appropriate concurrency limits
2. **LLM Usage**: Set confidence thresholds to minimize AI calls
3. **Caching**: Rules-based extraction is fast and cacheable
4. **Memory**: Monitor memory usage with large files
5. **Portal Speed**: Adjust Playwright timeouts for slow portals

### Scaling Considerations

- **Horizontal**: Run multiple instances behind load balancer
- **Vertical**: Increase memory/CPU for large document processing
- **Storage**: Monitor upload directory size
- **Database**: Consider adding persistent storage for sessions

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Add tests for new functionality
4. Ensure all tests pass: `npm test`
5. Submit pull request

## 📄 License

This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0).

**Personal and Educational Use**: Free to use, modify, and distribute for non-commercial purposes.

**Commercial Use**: Requires explicit written permission from the copyright holder. Contact luxempig for commercial licensing.

See LICENSE file for full details.

## 🆘 Support

- **Documentation**: Check this README and inline code comments
- **Issues**: Use GitHub issues for bug reports
- **Discussions**: Use GitHub discussions for questions

---

Built with ❤️ for document processing automation
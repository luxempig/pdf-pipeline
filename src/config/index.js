import dotenv from 'dotenv';
import Joi from 'joi';

dotenv.config();

const configSchema = Joi.object({
  port: Joi.number().integer().min(1).max(65535).default(3000),
  nodeEnv: Joi.string().valid('development', 'production', 'test').default('development'),
  
  // LLM Configuration
  openaiApiKey: Joi.string().when('llmProvider', { is: 'openai', then: Joi.required() }),
  ollamaBaseUrl: Joi.string().uri().default('http://localhost:11434'),
  llmProvider: Joi.string().valid('ollama', 'openai').default('ollama'),
  llmModel: Joi.string().default('llama3.2:3b'),
  maxLlmCostPerRequest: Joi.number().positive().default(0.01),
  
  // Portal Configuration
  portalBaseUrl: Joi.string().uri().required(),
  portalUsername: Joi.string().required(),
  portalPassword: Joi.string().required(),
  
  // File Processing
  maxFileSize: Joi.number().integer().positive().default(10485760), // 10MB
  allowedFileTypes: Joi.array().items(Joi.string()).default(['pdf', 'eml', 'msg']),
  
  // Logging
  logLevel: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  logFile: Joi.string().default('logs/pipeline.log'),
});

const envVars = {
  port: process.env.PORT,
  nodeEnv: process.env.NODE_ENV,
  openaiApiKey: process.env.OPENAI_API_KEY,
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
  llmProvider: process.env.LLM_PROVIDER,
  llmModel: process.env.LLM_MODEL,
  maxLlmCostPerRequest: process.env.MAX_LLM_COST_PER_REQUEST,
  portalBaseUrl: process.env.PORTAL_BASE_URL,
  portalUsername: process.env.PORTAL_USERNAME,
  portalPassword: process.env.PORTAL_PASSWORD,
  maxFileSize: process.env.MAX_FILE_SIZE,
  allowedFileTypes: process.env.ALLOWED_FILE_TYPES?.split(','),
  logLevel: process.env.LOG_LEVEL,
  logFile: process.env.LOG_FILE,
};

const { error, value: config } = configSchema.validate(envVars, {
  abortEarly: false,
  stripUnknown: true,
});

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export default config;
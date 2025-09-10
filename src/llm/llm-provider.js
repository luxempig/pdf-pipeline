import axios from 'axios';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import CostTracker from './cost-tracker.js';

class LLMProvider {
  constructor() {
    this.costTracker = new CostTracker();
    this.provider = config.llmProvider;
    this.model = config.llmModel;
    this.maxCostPerRequest = config.maxLlmCostPerRequest;
  }

  async extractFields(text, missingFields, sessionId) {
    try {
      // Check cost limits before making request
      const costCheck = this.costTracker.canMakeRequest(sessionId, this.maxCostPerRequest);
      if (!costCheck.allowed) {
        throw new Error(`Cost limit exceeded: ${costCheck.reason}`);
      }

      logger.info(`Attempting LLM extraction for session ${sessionId}, missing fields: ${missingFields.join(', ')}`);

      let result;
      if (this.provider === 'ollama') {
        result = await this.callOllama(text, missingFields, sessionId);
      } else if (this.provider === 'openai') {
        result = await this.callOpenAI(text, missingFields, sessionId);
      } else {
        throw new Error(`Unsupported LLM provider: ${this.provider}`);
      }

      logger.info(`LLM extraction completed for session ${sessionId}`);
      return result;

    } catch (error) {
      logger.error(`LLM extraction failed for session ${sessionId}:`, error);
      throw error;
    }
  }

  async callOllama(text, missingFields, sessionId) {
    const prompt = this.buildExtractionPrompt(text, missingFields);
    
    // Truncate text if too long (Ollama typically handles ~4k tokens well)
    const truncatedPrompt = this.costTracker.truncateToTokenLimit(prompt, 3000);
    
    const requestData = {
      model: this.model,
      prompt: truncatedPrompt,
      stream: false,
      options: {
        temperature: 0.1,
        top_p: 0.9
      }
    };

    try {
      const response = await axios.post(
        `${config.ollamaBaseUrl}/api/generate`,
        requestData,
        { timeout: 30000 }
      );

      const inputTokens = this.costTracker.estimateTokens(truncatedPrompt);
      const outputTokens = this.costTracker.estimateTokens(response.data.response || '');
      
      // Track cost (Ollama is free, but we track for consistency)
      this.costTracker.trackRequest(sessionId, this.model, inputTokens, outputTokens);

      return this.parseExtractionResponse(response.data.response, missingFields);

    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Ollama server is not running. Please start Ollama and try again.');
      }
      throw new Error(`Ollama API error: ${error.message}`);
    }
  }

  async callOpenAI(text, missingFields, sessionId) {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const messages = [
      {
        role: 'system',
        content: 'You are an expert at extracting structured information from documents. Return only valid JSON with the requested fields.'
      },
      {
        role: 'user',
        content: this.buildExtractionPrompt(text, missingFields)
      }
    ];

    const requestData = {
      model: this.model.includes('gpt') ? this.model : 'gpt-4o-mini',
      messages,
      temperature: 0.1,
      max_tokens: 500
    };

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${config.openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const usage = response.data.usage;
      const cost = this.costTracker.trackRequest(
        sessionId,
        requestData.model,
        usage.prompt_tokens,
        usage.completion_tokens
      );

      logger.info(`OpenAI request cost: $${cost.requestCost.toFixed(6)}`);

      return this.parseExtractionResponse(
        response.data.choices[0].message.content,
        missingFields
      );

    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('Invalid OpenAI API key');
      }
      if (error.response?.status === 429) {
        throw new Error('OpenAI API rate limit exceeded');
      }
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  buildExtractionPrompt(text, missingFields) {
    const fieldDescriptions = {
      email: 'email addresses',
      phone: 'phone numbers',
      name: 'person names',
      date: 'dates',
      amount: 'monetary amounts',
      address: 'physical addresses',
      invoiceNumber: 'invoice or document numbers',
      company: 'company or organization names'
    };

    const fieldsToExtract = missingFields.map(field => 
      `"${field}": "${fieldDescriptions[field] || field}"`
    ).join(', ');

    return `Extract the following information from this document text and return ONLY a valid JSON object:

Fields to extract: {${fieldsToExtract}}

Document text:
${text}

Return format: {"fieldName": "extracted_value", ...}
If a field cannot be found, use null as the value.
Only return the JSON object, no additional text.`;
  }

  parseExtractionResponse(responseText, missingFields) {
    try {
      // Clean the response to extract JSON
      let jsonString = responseText.trim();
      
      // Remove any text before the first {
      const jsonStart = jsonString.indexOf('{');
      if (jsonStart > 0) {
        jsonString = jsonString.substring(jsonStart);
      }

      // Remove any text after the last }
      const jsonEnd = jsonString.lastIndexOf('}');
      if (jsonEnd < jsonString.length - 1) {
        jsonString = jsonString.substring(0, jsonEnd + 1);
      }

      const extracted = JSON.parse(jsonString);
      const result = {};

      // Process each requested field
      for (const field of missingFields) {
        const value = extracted[field];
        if (value && value !== null && value !== '') {
          result[field] = [{
            value: value,
            confidence: 0.7, // LLM extraction gets moderate confidence
            source: 'llm',
            context: 'Extracted by LLM fallback'
          }];
        }
      }

      return result;

    } catch (error) {
      logger.error('Failed to parse LLM response:', responseText);
      logger.error('Parse error:', error);
      
      // Return empty results if parsing fails
      return {};
    }
  }

  async healthCheck() {
    try {
      if (this.provider === 'ollama') {
        const response = await axios.get(`${config.ollamaBaseUrl}/api/tags`, { timeout: 5000 });
        const models = response.data.models || [];
        const modelExists = models.some(m => m.name === this.model);
        
        return {
          provider: 'ollama',
          status: 'healthy',
          model: this.model,
          modelAvailable: modelExists,
          url: config.ollamaBaseUrl
        };
      } else if (this.provider === 'openai') {
        // Simple test with minimal cost
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 1
          },
          {
            headers: {
              'Authorization': `Bearer ${config.openaiApiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );

        return {
          provider: 'openai',
          status: 'healthy',
          model: this.model
        };
      }
    } catch (error) {
      return {
        provider: this.provider,
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  getCostTracker() {
    return this.costTracker;
  }
}

export default LLMProvider;
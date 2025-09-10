import logger from '../utils/logger.js';

class CostTracker {
  constructor() {
    this.costs = new Map(); // sessionId -> cost info
    this.dailyTotals = new Map(); // date -> total cost
    this.requestCounts = new Map(); // sessionId -> request count
  }

  // Token pricing (as of 2024, approximate costs)
  static PRICING = {
    'gpt-4o-mini': {
      input: 0.00015 / 1000,  // per token
      output: 0.0006 / 1000
    },
    'gpt-3.5-turbo': {
      input: 0.0005 / 1000,
      output: 0.0015 / 1000
    },
    'ollama': {
      input: 0, // Local model, no cost
      output: 0
    }
  };

  calculateCost(model, inputTokens, outputTokens) {
    const pricing = CostTracker.PRICING[model] || CostTracker.PRICING['ollama'];
    return (inputTokens * pricing.input) + (outputTokens * pricing.output);
  }

  trackRequest(sessionId, model, inputTokens, outputTokens) {
    const cost = this.calculateCost(model, inputTokens, outputTokens);
    const today = new Date().toISOString().split('T')[0];

    // Track session costs
    if (!this.costs.has(sessionId)) {
      this.costs.set(sessionId, {
        totalCost: 0,
        requests: [],
        startTime: new Date()
      });
    }

    const session = this.costs.get(sessionId);
    session.totalCost += cost;
    session.requests.push({
      timestamp: new Date(),
      model,
      inputTokens,
      outputTokens,
      cost
    });

    // Track daily totals
    this.dailyTotals.set(today, (this.dailyTotals.get(today) || 0) + cost);

    // Track request counts
    this.requestCounts.set(sessionId, (this.requestCounts.get(sessionId) || 0) + 1);

    logger.info(`LLM request tracked - Session: ${sessionId}, Model: ${model}, Cost: $${cost.toFixed(6)}`);

    return {
      requestCost: cost,
      sessionTotal: session.totalCost,
      dailyTotal: this.dailyTotals.get(today),
      requestCount: this.requestCounts.get(sessionId)
    };
  }

  canMakeRequest(sessionId, maxCostPerRequest, maxDailyCost = null) {
    const session = this.costs.get(sessionId);
    const today = new Date().toISOString().split('T')[0];
    const dailyTotal = this.dailyTotals.get(today) || 0;

    // Check per-request limit
    if (maxCostPerRequest && maxCostPerRequest > 0) {
      // This is a pre-flight check - we assume the request might cost up to the limit
      if (maxCostPerRequest > maxCostPerRequest) {
        return {
          allowed: false,
          reason: 'Request would exceed per-request cost limit'
        };
      }
    }

    // Check daily limit
    if (maxDailyCost && (dailyTotal + maxCostPerRequest) > maxDailyCost) {
      return {
        allowed: false,
        reason: 'Request would exceed daily cost limit'
      };
    }

    return {
      allowed: true,
      sessionCost: session?.totalCost || 0,
      dailyCost: dailyTotal
    };
  }

  getSessionStats(sessionId) {
    const session = this.costs.get(sessionId);
    if (!session) {
      return {
        totalCost: 0,
        requestCount: 0,
        averageCost: 0,
        requests: []
      };
    }

    return {
      totalCost: session.totalCost,
      requestCount: session.requests.length,
      averageCost: session.requests.length > 0 ? session.totalCost / session.requests.length : 0,
      startTime: session.startTime,
      requests: session.requests
    };
  }

  getDailyStats(date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return {
      date: targetDate,
      totalCost: this.dailyTotals.get(targetDate) || 0,
      requestCount: this.getTotalRequestsForDate(targetDate)
    };
  }

  getTotalRequestsForDate(date) {
    let count = 0;
    for (const session of this.costs.values()) {
      count += session.requests.filter(req => 
        req.timestamp.toISOString().split('T')[0] === date
      ).length;
    }
    return count;
  }

  reset(sessionId = null) {
    if (sessionId) {
      this.costs.delete(sessionId);
      this.requestCounts.delete(sessionId);
      logger.info(`Reset cost tracking for session: ${sessionId}`);
    } else {
      this.costs.clear();
      this.requestCounts.clear();
      this.dailyTotals.clear();
      logger.info('Reset all cost tracking data');
    }
  }

  // Estimate token count (rough approximation)
  estimateTokens(text) {
    // Rough approximation: 1 token ≈ 0.75 words
    const words = text.split(/\s+/).length;
    return Math.ceil(words / 0.75);
  }

  // Truncate text to fit within token limits
  truncateToTokenLimit(text, maxTokens) {
    const estimatedTokens = this.estimateTokens(text);
    if (estimatedTokens <= maxTokens) {
      return text;
    }

    const ratio = maxTokens / estimatedTokens;
    const targetLength = Math.floor(text.length * ratio * 0.9); // 10% buffer
    
    return text.substring(0, targetLength) + '...[truncated]';
  }
}

export default CostTracker;
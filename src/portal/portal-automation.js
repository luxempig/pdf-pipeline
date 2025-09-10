import { chromium } from 'playwright';
import config from '../config/index.js';
import logger from '../utils/logger.js';

class PortalAutomation {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
    this.baseUrl = config.portalBaseUrl;
    this.username = config.portalUsername;
    this.password = config.portalPassword;
  }

  async initialize(options = {}) {
    const {
      headless = true,
      slowMo = 0,
      timeout = 30000
    } = options;

    try {
      logger.info('Initializing portal automation');

      this.browser = await chromium.launch({
        headless,
        slowMo,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      this.page = await this.browser.newPage();
      this.page.setDefaultTimeout(timeout);

      // Set viewport
      await this.page.setViewportSize({ width: 1280, height: 720 });

      // Add request logging
      this.page.on('request', request => {
        logger.debug(`Request: ${request.method()} ${request.url()}`);
      });

      // Handle errors
      this.page.on('pageerror', error => {
        logger.error('Page error:', error);
      });

      logger.info('Portal automation initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize portal automation:', error);
      throw error;
    }
  }

  async login() {
    try {
      if (this.isLoggedIn) {
        logger.info('Already logged in to portal');
        return;
      }

      logger.info('Logging into portal');
      await this.page.goto(`${this.baseUrl}/login`);

      // Wait for login form
      await this.page.waitForSelector('input[type="text"], input[type="email"]', { timeout: 10000 });
      
      // Fill login credentials - these selectors may need customization
      const usernameSelector = 'input[name="username"], input[name="email"], input[type="email"]';
      const passwordSelector = 'input[name="password"], input[type="password"]';
      const loginButtonSelector = 'button[type="submit"], input[type="submit"], button:has-text("Login")';

      await this.page.fill(usernameSelector, this.username);
      await this.page.fill(passwordSelector, this.password);
      
      // Click login button
      await this.page.click(loginButtonSelector);

      // Wait for successful login (look for dashboard or main content)
      await this.page.waitForSelector('nav, .dashboard, .main-content', { timeout: 15000 });

      this.isLoggedIn = true;
      logger.info('Successfully logged into portal');

    } catch (error) {
      logger.error('Login failed:', error);
      throw new Error(`Portal login failed: ${error.message}`);
    }
  }

  async submitExtractedData(extractedFields, options = {}) {
    const {
      formType = 'default',
      dryRun = false,
      screenshots = true
    } = options;

    try {
      if (!this.isLoggedIn) {
        await this.login();
      }

      logger.info(`Starting portal submission for form type: ${formType}`);

      if (screenshots) {
        await this.takeScreenshot('before_submission');
      }

      // Navigate to the submission form
      const submissionResult = await this.navigateToSubmissionForm(formType);
      if (!submissionResult.success) {
        throw new Error(submissionResult.error);
      }

      // Fill the form with extracted data
      const fillResult = await this.fillForm(extractedFields, dryRun);
      if (!fillResult.success) {
        throw new Error(fillResult.error);
      }

      if (screenshots) {
        await this.takeScreenshot('form_filled');
      }

      let submitResult = { success: true, message: 'Dry run - form not submitted' };
      
      if (!dryRun) {
        submitResult = await this.submitForm();
        
        if (screenshots && submitResult.success) {
          await this.takeScreenshot('after_submission');
        }
      }

      logger.info(`Portal submission completed: ${submitResult.message}`);

      return {
        success: submitResult.success,
        message: submitResult.message,
        formData: fillResult.filledFields,
        submissionId: submitResult.submissionId,
        screenshots: screenshots ? this.getScreenshotPaths() : [],
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Portal submission failed:', error);
      
      if (screenshots) {
        await this.takeScreenshot('error_state');
      }

      throw error;
    }
  }

  async navigateToSubmissionForm(formType) {
    try {
      // This is a generic implementation - customize based on your portal
      const formUrls = {
        'default': '/submit',
        'invoice': '/submit/invoice',
        'expense': '/submit/expense',
        'document': '/submit/document'
      };

      const formUrl = formUrls[formType] || formUrls['default'];
      
      await this.page.goto(`${this.baseUrl}${formUrl}`);
      
      // Wait for form to load
      await this.page.waitForSelector('form', { timeout: 10000 });
      
      logger.info(`Navigated to submission form: ${formUrl}`);
      
      return { success: true };

    } catch (error) {
      return { 
        success: false, 
        error: `Navigation failed: ${error.message}` 
      };
    }
  }

  async fillForm(extractedFields, dryRun) {
    try {
      const filledFields = {};
      
      // Define field mappings - customize based on your portal's form structure
      const fieldMappings = {
        'email': ['input[name="email"]', 'input[type="email"]'],
        'phone': ['input[name="phone"]', 'input[name="phoneNumber"]'],
        'name': ['input[name="name"]', 'input[name="fullName"]'],
        'company': ['input[name="company"]', 'input[name="organization"]'],
        'amount': ['input[name="amount"]', 'input[name="totalAmount"]'],
        'date': ['input[name="date"]', 'input[type="date"]'],
        'invoiceNumber': ['input[name="invoiceNumber"]', 'input[name="documentNumber"]'],
        'address': ['textarea[name="address"]', 'input[name="address"]']
      };

      for (const [fieldName, matches] of Object.entries(extractedFields)) {
        if (!matches || matches.length === 0) continue;

        const bestMatch = matches[0];
        const selectors = fieldMappings[fieldName];
        
        if (!selectors) {
          logger.warn(`No form mapping found for field: ${fieldName}`);
          continue;
        }

        let filled = false;
        
        for (const selector of selectors) {
          try {
            const element = await this.page.$(selector);
            if (element) {
              if (!dryRun) {
                await element.fill(bestMatch.value);
                logger.debug(`Filled ${fieldName}: ${bestMatch.value}`);
              } else {
                logger.debug(`[DRY RUN] Would fill ${fieldName}: ${bestMatch.value}`);
              }
              
              filledFields[fieldName] = {
                value: bestMatch.value,
                confidence: bestMatch.confidence,
                selector: selector
              };
              
              filled = true;
              break;
            }
          } catch (error) {
            logger.debug(`Failed to fill ${selector}: ${error.message}`);
          }
        }

        if (!filled) {
          logger.warn(`Could not find form field for: ${fieldName}`);
        }
      }

      logger.info(`Form filling completed. Filled ${Object.keys(filledFields).length} fields`);

      return {
        success: true,
        filledFields
      };

    } catch (error) {
      return {
        success: false,
        error: `Form filling failed: ${error.message}`
      };
    }
  }

  async submitForm() {
    try {
      // Look for submit button
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Submit")',
        'button:has-text("Save")',
        '.submit-btn',
        '#submit'
      ];

      let submitButton = null;
      
      for (const selector of submitSelectors) {
        submitButton = await this.page.$(selector);
        if (submitButton) break;
      }

      if (!submitButton) {
        throw new Error('Submit button not found');
      }

      // Click submit
      await submitButton.click();

      // Wait for submission confirmation
      try {
        await this.page.waitForSelector(
          '.success-message, .confirmation, [class*="success"]',
          { timeout: 15000 }
        );
        
        const confirmationText = await this.page.textContent('.success-message, .confirmation');
        
        // Try to extract submission ID
        const submissionId = await this.extractSubmissionId();

        return {
          success: true,
          message: confirmationText || 'Form submitted successfully',
          submissionId
        };

      } catch (waitError) {
        // Check if there are validation errors
        const errors = await this.page.$$('.error, .field-error, [class*="error"]');
        
        if (errors.length > 0) {
          const errorTexts = await Promise.all(
            errors.map(err => err.textContent())
          );
          throw new Error(`Form validation errors: ${errorTexts.join(', ')}`);
        }

        // No explicit confirmation found, but no errors either
        logger.warn('No confirmation message found, but submission may have succeeded');
        
        return {
          success: true,
          message: 'Form submitted (no confirmation message found)',
          submissionId: null
        };
      }

    } catch (error) {
      return {
        success: false,
        error: `Form submission failed: ${error.message}`
      };
    }
  }

  async extractSubmissionId() {
    try {
      // Common patterns for submission IDs
      const idPatterns = [
        /(?:ID|Reference|Confirmation)[:\s#]*([A-Z0-9-]+)/i,
        /([A-Z0-9]{8,})/,
        /#([A-Z0-9-]+)/
      ];

      const pageText = await this.page.textContent('body');
      
      for (const pattern of idPatterns) {
        const match = pageText.match(pattern);
        if (match && match[1]) {
          return match[1];
        }
      }

      return null;

    } catch (error) {
      logger.debug('Failed to extract submission ID:', error);
      return null;
    }
  }

  async takeScreenshot(name) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${name}_${timestamp}.png`;
      const path = `logs/${filename}`;
      
      await this.page.screenshot({ path, fullPage: true });
      logger.info(`Screenshot saved: ${path}`);
      
      return path;

    } catch (error) {
      logger.error('Screenshot failed:', error);
      return null;
    }
  }

  getScreenshotPaths() {
    // This would return paths of screenshots taken during the session
    // In a real implementation, you'd track these throughout the process
    return [];
  }

  async verifyFormStructure(formType = 'default') {
    try {
      await this.navigateToSubmissionForm(formType);
      
      const formElements = await this.page.$$eval('form input, form select, form textarea', 
        elements => elements.map(el => ({
          name: el.name,
          type: el.type,
          id: el.id,
          placeholder: el.placeholder,
          required: el.required
        }))
      );

      return {
        success: true,
        formStructure: formElements,
        totalFields: formElements.length
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async close() {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      
      this.isLoggedIn = false;
      logger.info('Portal automation closed');

    } catch (error) {
      logger.error('Error closing portal automation:', error);
    }
  }

  // Health check
  async healthCheck() {
    try {
      if (!this.browser || !this.page) {
        return { status: 'not_initialized' };
      }

      // Simple page navigation test
      await this.page.goto(`${this.baseUrl}/health`, { timeout: 10000 });
      
      return {
        status: 'healthy',
        baseUrl: this.baseUrl,
        isLoggedIn: this.isLoggedIn
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

export default PortalAutomation;
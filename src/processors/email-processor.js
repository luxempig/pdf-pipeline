import fs from 'fs-extra';
import { simpleParser } from 'mailparser';
import logger from '../utils/logger.js';

class EmailProcessor {
  constructor() {
    this.supportedMimeTypes = [
      'message/rfc822',
      'application/vnd.ms-outlook',
      'text/plain'
    ];
  }

  async process(filePath) {
    try {
      logger.info(`Processing email file: ${filePath}`);
      
      if (!await fs.pathExists(filePath)) {
        throw new Error(`Email file not found: ${filePath}`);
      }

      const fileBuffer = await fs.readFile(filePath);
      const parsed = await simpleParser(fileBuffer);

      // Extract text content prioritizing plain text over HTML
      let textContent = '';
      if (parsed.text) {
        textContent = parsed.text;
      } else if (parsed.html) {
        // Simple HTML to text conversion
        textContent = parsed.html
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      const result = {
        type: 'email',
        filename: filePath.split('/').pop(),
        text: textContent,
        metadata: {
          subject: parsed.subject || 'No Subject',
          from: this.extractEmailAddress(parsed.from),
          to: this.extractEmailAddresses(parsed.to),
          date: parsed.date ? new Date(parsed.date).toISOString() : null,
          hasAttachments: parsed.attachments && parsed.attachments.length > 0,
          attachmentCount: parsed.attachments ? parsed.attachments.length : 0,
          wordCount: textContent.split(/\s+/).length,
          extractedAt: new Date().toISOString()
        },
        rawData: {
          headers: parsed.headers,
          text: parsed.text,
          html: parsed.html,
          attachments: parsed.attachments || []
        }
      };

      logger.info(`Successfully processed email: ${result.metadata.subject}, From: ${result.metadata.from}, Words: ${result.metadata.wordCount}`);
      return result;

    } catch (error) {
      logger.error(`Error processing email ${filePath}:`, error);
      throw new Error(`Email processing failed: ${error.message}`);
    }
  }

  extractEmailAddress(addressObj) {
    if (!addressObj) return null;
    if (typeof addressObj === 'string') return addressObj;
    if (addressObj.text) return addressObj.text;
    if (Array.isArray(addressObj) && addressObj.length > 0) {
      return addressObj[0].text || addressObj[0].address;
    }
    return addressObj.address || null;
  }

  extractEmailAddresses(addressObj) {
    if (!addressObj) return [];
    if (typeof addressObj === 'string') return [addressObj];
    if (Array.isArray(addressObj)) {
      return addressObj.map(addr => addr.text || addr.address);
    }
    return [addressObj.text || addressObj.address];
  }

  isSupported(mimeType) {
    return this.supportedMimeTypes.includes(mimeType);
  }

  async validate(filePath) {
    try {
      const stats = await fs.stat(filePath);
      
      if (stats.size === 0) {
        throw new Error('Email file is empty');
      }

      // Basic email format validation
      const content = await fs.readFile(filePath, 'utf8');
      
      // Check for basic email headers
      const hasBasicHeaders = /^(From|To|Subject|Date):/mi.test(content);
      if (!hasBasicHeaders && !content.includes('Message-ID')) {
        throw new Error('Invalid email file format - missing required headers');
      }

      return true;
    } catch (error) {
      logger.error(`Email validation failed for ${filePath}:`, error);
      throw error;
    }
  }

  getSupportedExtensions() {
    return ['eml', 'msg', 'txt'];
  }
}

export default EmailProcessor;
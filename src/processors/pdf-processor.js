import fs from 'fs-extra';
import pdfParse from 'pdf-parse';
import logger from '../utils/logger.js';

class PDFProcessor {
  constructor() {
    this.supportedMimeTypes = [
      'application/pdf',
      'application/x-pdf',
      'application/acrobat'
    ];
  }

  async process(filePath) {
    try {
      logger.info(`Processing PDF file: ${filePath}`);
      
      if (!await fs.pathExists(filePath)) {
        throw new Error(`PDF file not found: ${filePath}`);
      }

      const fileBuffer = await fs.readFile(filePath);
      const pdfData = await pdfParse(fileBuffer);

      const result = {
        type: 'pdf',
        filename: filePath.split('/').pop(),
        text: pdfData.text,
        metadata: {
          pages: pdfData.numpages,
          info: pdfData.info || {},
          version: pdfData.version || 'unknown',
          wordCount: pdfData.text.split(/\s+/).length,
          extractedAt: new Date().toISOString()
        },
        rawData: {
          text: pdfData.text,
          pages: pdfData.numpages
        }
      };

      logger.info(`Successfully processed PDF: ${result.filename}, Pages: ${result.metadata.pages}, Words: ${result.metadata.wordCount}`);
      return result;

    } catch (error) {
      logger.error(`Error processing PDF ${filePath}:`, error);
      throw new Error(`PDF processing failed: ${error.message}`);
    }
  }

  isSupported(mimeType) {
    return this.supportedMimeTypes.includes(mimeType);
  }

  async validate(filePath) {
    try {
      const stats = await fs.stat(filePath);
      
      if (stats.size === 0) {
        throw new Error('PDF file is empty');
      }

      // Basic PDF header validation
      const buffer = await fs.readFile(filePath, { encoding: null, flag: 'r' });
      const header = buffer.toString('ascii', 0, 8);
      
      if (!header.startsWith('%PDF-')) {
        throw new Error('Invalid PDF file format');
      }

      return true;
    } catch (error) {
      logger.error(`PDF validation failed for ${filePath}:`, error);
      throw error;
    }
  }

  getSupportedExtensions() {
    return ['pdf'];
  }
}

export default PDFProcessor;
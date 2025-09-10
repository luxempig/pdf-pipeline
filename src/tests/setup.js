import dotenv from 'dotenv';
import fs from 'fs-extra';
import path from 'path';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Ensure test directories exist
beforeAll(async () => {
  await fs.ensureDir('uploads');
  await fs.ensureDir('logs');
});

// Clean up after tests
afterAll(async () => {
  // Clean up test uploads (but keep directories)
  const uploadsDir = 'uploads';
  if (await fs.pathExists(uploadsDir)) {
    const files = await fs.readdir(uploadsDir);
    for (const file of files) {
      if (file !== '.gitkeep') {
        await fs.remove(path.join(uploadsDir, file));
      }
    }
  }
});
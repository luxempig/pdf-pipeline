# PDF Pipeline - Deployment Guide

This guide covers various deployment options for the PDF Pipeline system.

## 🚀 Quick Deployment Options

### Option 1: Local Development

```bash
# Clone and setup
git clone <repository-url>
cd pdf_pipeline
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Install Playwright browsers
npx playwright install

# Start services
npm start
```

### Option 2: Docker Compose (Recommended)

```bash
# Clone repository
git clone <repository-url>
cd pdf_pipeline

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f pdf-pipeline

# Stop services
docker-compose down
```

### Option 3: Production Server

```bash
# On your server
git clone <repository-url>
cd pdf_pipeline

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install dependencies
npm ci --production

# Configure environment
cp .env.example .env
vim .env  # Set production values

# Install PM2 for process management
npm install -g pm2

# Start with PM2
pm2 start ecosystem.config.js

# Setup PM2 startup
pm2 startup
pm2 save
```

## 🔧 Configuration

### Environment Variables

**Required Settings:**
```env
NODE_ENV=production
PORT=3000
PORTAL_BASE_URL=https://your-portal.com
PORTAL_USERNAME=your_username
PORTAL_PASSWORD=your_password
```

**Optional Settings:**
```env
# LLM Configuration
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
LLM_MODEL=llama3.2:3b
MAX_LLM_COST_PER_REQUEST=0.01

# File Processing
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=pdf,eml,msg

# Logging
LOG_LEVEL=info
LOG_FILE=logs/pipeline.log
```

### PM2 Configuration

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'pdf-pipeline',
    script: 'src/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_file: 'logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
```

## 🐳 Docker Deployment

### Single Container

```dockerfile
# Build image
docker build -t pdf-pipeline .

# Run container
docker run -d \
  --name pdf-pipeline \
  -p 3000:3000 \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/.env:/app/.env \
  pdf-pipeline
```

### Docker Compose with Ollama

```yaml
version: '3.8'
services:
  pdf-pipeline:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs
      - ./.env:/app/.env
    depends_on:
      - ollama
    restart: unless-stopped

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    restart: unless-stopped

volumes:
  ollama_data:
```

## ☁️ Cloud Deployment

### AWS EC2

**1. Launch EC2 Instance:**
- Ubuntu 22.04 LTS
- t3.medium or larger
- Security group: ports 22, 80, 443, 3000

**2. Setup Script:**
```bash
#!/bin/bash

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.17.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Clone and setup application
git clone <your-repo-url> pdf_pipeline
cd pdf_pipeline

# Configure environment
cp .env.example .env
# Edit .env with your production settings

# Start services
docker-compose up -d

# Setup nginx reverse proxy
sudo apt install nginx -y
sudo cp nginx.conf /etc/nginx/sites-available/pdf-pipeline
sudo ln -s /etc/nginx/sites-available/pdf-pipeline /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

**3. Nginx Configuration (`nginx.conf`):**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50M;
    }

    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }
}
```

### Google Cloud Platform

**1. Create VM Instance:**
```bash
gcloud compute instances create pdf-pipeline \
  --zone=us-central1-a \
  --machine-type=n1-standard-2 \
  --image-family=ubuntu-2004-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=50GB \
  --tags=http-server,https-server
```

**2. Setup Application:**
```bash
# SSH to instance
gcloud compute ssh pdf-pipeline

# Run setup script (same as AWS above)
```

**3. Configure Firewall:**
```bash
gcloud compute firewall-rules create allow-pdf-pipeline \
  --allow tcp:3000 \
  --source-ranges 0.0.0.0/0 \
  --description "Allow PDF Pipeline"
```

### Azure Container Instances

**1. Create Resource Group:**
```bash
az group create --name pdf-pipeline-rg --location eastus
```

**2. Deploy Container:**
```bash
az container create \
  --resource-group pdf-pipeline-rg \
  --name pdf-pipeline \
  --image your-registry/pdf-pipeline:latest \
  --cpu 2 \
  --memory 4 \
  --ports 3000 \
  --environment-variables \
    NODE_ENV=production \
    PORTAL_BASE_URL=https://your-portal.com \
  --restart-policy Always
```

## 🔒 Security Considerations

### Production Security Checklist

**Application Security:**
- [ ] Set `NODE_ENV=production`
- [ ] Use strong passwords for portal credentials
- [ ] Enable HTTPS with SSL certificates
- [ ] Set up proper firewall rules
- [ ] Use environment variables for secrets
- [ ] Enable request rate limiting
- [ ] Set up proper CORS headers

**Infrastructure Security:**
- [ ] Keep system packages updated
- [ ] Use non-root containers
- [ ] Implement log rotation
- [ ] Set up monitoring and alerting
- [ ] Use secrets management (AWS Secrets Manager, etc.)
- [ ] Enable backup strategies

**Portal Security:**
- [ ] Use dedicated service account
- [ ] Implement session timeout
- [ ] Enable two-factor authentication if available
- [ ] Monitor portal access logs

### SSL/TLS Setup with Let's Encrypt

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## 📊 Monitoring & Logging

### Application Monitoring

**Health Check Endpoints:**
- `GET /health` - Overall system health
- `GET /api/status` - Detailed component status

**Logging Setup:**
```javascript
// Configure structured logging
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console()
  ]
});
```

### System Monitoring

**Using PM2:**
```bash
# Monitor processes
pm2 monit

# View logs
pm2 logs

# Restart application
pm2 restart pdf-pipeline
```

**Using Docker:**
```bash
# Monitor containers
docker stats

# View logs
docker-compose logs -f pdf-pipeline

# Restart services
docker-compose restart pdf-pipeline
```

### External Monitoring

**Uptime Robot Setup:**
1. Create account at uptimerobot.com
2. Add HTTP(s) monitor for your domain
3. Set up email/SMS alerts

**Basic Metrics Collection:**
```javascript
// Add to your application
app.get('/metrics', (req, res) => {
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    timestamp: new Date().toISOString()
  });
});
```

## 🔄 Backup and Recovery

### Data Backup Strategy

**Files to Backup:**
- Configuration files (`.env`, `ecosystem.config.js`)
- Uploaded documents (`uploads/`)
- Application logs (`logs/`)
- Custom rules and configurations

**Backup Script:**
```bash
#!/bin/bash

# Backup script for PDF Pipeline
BACKUP_DIR="/backups/pdf-pipeline"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$DATE.tar.gz"

mkdir -p $BACKUP_DIR

# Create backup
tar -czf $BACKUP_FILE \
  .env \
  uploads/ \
  logs/ \
  ecosystem.config.js

# Keep only last 7 backups
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +7 -delete

echo "Backup created: $BACKUP_FILE"
```

**Automated Backup with Cron:**
```bash
# Add to crontab
0 2 * * * /path/to/backup-script.sh
```

### Disaster Recovery

**Quick Recovery Steps:**
1. Restore from backup
2. Install dependencies: `npm ci --production`
3. Start application: `pm2 start ecosystem.config.js`
4. Verify health: `curl http://localhost:3000/health`

**High Availability Setup:**
- Load balancer with multiple instances
- Shared storage for uploads
- Database for session persistence
- Health check and automatic failover

## 🚀 Performance Optimization

### Production Optimizations

**Node.js Optimizations:**
```bash
# Increase memory limit
node --max-old-space-size=2048 src/index.js

# Enable clustering
PM2_INSTANCES=max pm2 start ecosystem.config.js
```

**System Optimizations:**
```bash
# Increase file descriptor limits
echo "* soft nofile 65536" >> /etc/security/limits.conf
echo "* hard nofile 65536" >> /etc/security/limits.conf

# Optimize TCP settings for high connections
echo "net.core.somaxconn = 65536" >> /etc/sysctl.conf
sysctl -p
```

**Caching Strategy:**
- Implement Redis for session caching
- Use CDN for static assets
- Cache extraction results for similar documents

This deployment guide provides comprehensive coverage for getting your PDF Pipeline system running in production environments securely and efficiently.
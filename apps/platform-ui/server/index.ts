import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import catalogRouter from './routes/catalog.js';
import generatorRouter from './routes/generator.js';
import nlpRouter from './routes/nlp.js';
import requestsRouter from './routes/requests.js';

const app = express();
const PORT = process.env.PORT || 3456;

app.use(cors());
app.use(express.json());

// Health check with env var status
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      GITHUB_TOKEN: process.env.GITHUB_TOKEN ? 'set' : 'missing',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'set' : 'missing',
      GITHUB_ORG: process.env.GITHUB_ORG ?? 'bscwaryan (default)',
    },
  });
});

// API routes
app.use('/api/catalog', catalogRouter);
app.use('/api/generate', generatorRouter);
app.use('/api/nlp', nlpRouter);
app.use('/api/requests', requestsRouter);

// Serve static files in production
// Works both when running from source (tsx) and compiled (node dist/server/)
const clientDist = path.join(process.cwd(), 'dist', 'public');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Platform UI server running on http://0.0.0.0:${PORT}`);
  if (!process.env.GITHUB_TOKEN) {
    console.warn('  WARNING: GITHUB_TOKEN not set — repo generation will fail');
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('  WARNING: ANTHROPIC_API_KEY not set — NLP analysis will fail');
  }
});

export default app;

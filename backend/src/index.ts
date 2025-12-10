// src/index.ts
import cors from 'cors';
import express, { Request, Response } from 'express';
import { diffConfigs, DiffResult } from './compiler/diff';
import { checkInvariants, InvariantViolation } from './compiler/invariants';
import { parseConfigToIR, ParseFormat } from './compiler/parser';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

interface AnalyzeRequestBody {
  config: string;
  format: ParseFormat;
}

app.post('/api/analyze', (req: Request, res: Response) => {
  const body = req.body as AnalyzeRequestBody;

  if (!body || typeof body.config !== 'string' || !body.format) {
    return res
      .status(400)
      .json({
        error: 'config (string) and format ("yaml" | "json") are required.'
      });
  }

  const parseResult = parseConfigToIR(body.config, body.format);
  if (!parseResult.ir) {
    return res.status(400).json({
      errors: parseResult.errors
    });
  }

  const ir = parseResult.ir;
  const violations: InvariantViolation[] = checkInvariants(ir);

  return res.json({
    ir,
    violations,
    errors: parseResult.errors
  });
});

interface DiffRequestBody {
  oldConfig: string;
  newConfig: string;
  format: ParseFormat;
}

app.post('/api/diff', (req: Request, res: Response) => {
  const body = req.body as DiffRequestBody;

  if (
    !body ||
    typeof body.oldConfig !== 'string' ||
    typeof body.newConfig !== 'string' ||
    !body.format
  ) {
    return res.status(400).json({
      error:
        'oldConfig, newConfig (strings) and format ("yaml" | "json") are required.'
    });
  }

  const oldParsed = parseConfigToIR(body.oldConfig, body.format);
  const newParsed = parseConfigToIR(body.newConfig, body.format);

  const errors = [...oldParsed.errors, ...newParsed.errors];
  if (!oldParsed.ir || !newParsed.ir) {
    return res.status(400).json({ errors });
  }

  const oldViolations = checkInvariants(oldParsed.ir);
  const newViolations = checkInvariants(newParsed.ir);

  const diff: DiffResult = diffConfigs(
    oldParsed.ir,
    newParsed.ir,
    oldViolations,
    newViolations
  );

  return res.json({
    oldIr: oldParsed.ir,
    newIr: newParsed.ir,
    oldViolations,
    newViolations,
    diff,
    errors
  });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'safeconfig-backend' });
});

app.listen(PORT, () => {
  console.log(`SafeConfig backend listening on http://localhost:${PORT}`);
});

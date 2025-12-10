#!/usr/bin/env node
// src/cli/safeconfig-cli.ts
import fs from 'fs';
import path from 'path';
import { checkInvariants } from '../compiler/invariants';
import { parseConfigToIR, ParseFormat } from '../compiler/parser';

function printUsage() {
  console.log('SafeConfig CLI');
  console.log('Usage:');
  console.log('  safeconfig analyze <config-file> [--format yaml|json]');
  console.log('');
  console.log('Examples:');
  console.log('  safeconfig analyze ./examples/sample-config.yaml --format yaml');
}

async function main() {
  const [, , command, configPath, ...rest] = process.argv;

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  if (command !== 'analyze') {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }

  if (!configPath) {
    console.error('Missing <config-file>');
    printUsage();
    process.exit(1);
  }

  let format: ParseFormat = 'yaml';
  const formatFlagIndex = rest.indexOf('--format');
  if (formatFlagIndex !== -1 && rest[formatFlagIndex + 1]) {
    const value = rest[formatFlagIndex + 1];
    if (value === 'yaml' || value === 'json') {
      format = value;
    } else {
      console.error('Invalid format. Use "yaml" or "json".');
      process.exit(1);
    }
  }

  const absolutePath = path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`File not found: ${absolutePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(absolutePath, 'utf-8');

  const parseResult = parseConfigToIR(raw, format);
  if (!parseResult.ir) {
    console.error('Parse / schema errors:');
    for (const e of parseResult.errors) {
      console.error('  - ' + e);
    }
    process.exit(1);
  }

  const ir = parseResult.ir;
  const violations = checkInvariants(ir);

  console.log(`Config hash: ${ir.metadata?.rawHash}`);
  console.log(`Services: ${ir.services.length}`);
  console.log('');

  if (violations.length === 0) {
    console.log('✅ No invariant violations found.');
  } else {
    console.log(`❌ Found ${violations.length} violation(s):`);
    for (const v of violations) {
      console.log(
        `  [${v.severity.toUpperCase()}] ${v.id} @ ${v.serviceName} -> ${v.description}`
      );
    }
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

// src/compiler/parser.ts
import crypto from 'crypto';
import YAML from 'js-yaml';
import { z, ZodIssue } from 'zod';
import { ConfigIR, Protocol, Service, ServiceType } from './ir';

const networkBindingSchema = z.object({
  host: z.string(),
  port: z.number().int().nonnegative(),
  protocol: z.enum(['http', 'https', 'tcp'])
});

const resourceLimitsSchema = z
  .object({
    cpu: z.number().optional(),
    memoryMb: z.number().optional()
  })
  .partial()
  .optional();

const serviceSchema = z.object({
  name: z.string(),
  type: z.enum(['api', 'db', 'queue', 'cache']),
  public: z.boolean().default(false),
  handlesPII: z.boolean().default(false),
  network: z.array(networkBindingSchema).default([]),
  dependsOn: z.array(z.string()).default([]),
  resourceLimits: resourceLimitsSchema
});

const configSchema = z.object({
  services: z.array(serviceSchema)
});

export type ParseFormat = 'yaml' | 'json';

export interface ParseResult {
  ir?: ConfigIR;
  errors: string[];
}

export function parseConfigToIR(
  rawConfig: string,
  format: ParseFormat
): ParseResult {
  const errors: string[] = [];
  let parsed: unknown;

  try {
    if (format === 'yaml') {
      parsed = YAML.load(rawConfig);
    } else {
      parsed = JSON.parse(rawConfig);
    }
  } catch (err) {
    errors.push(
      `Failed to parse ${format.toUpperCase()}: ${(err as Error).message}`
    );
    return { errors };
  }

  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    errors.push(
      'Schema validation failed: ' +
        result.error.issues
          .map((e: ZodIssue) => `${e.path.join('.')}: ${e.message}`)
          .join('; ')
    );
    return { errors };
  }

  const data = result.data;
  const hash = crypto
    .createHash('sha256')
    .update(rawConfig)
    .digest('hex')
    .slice(0, 12);

  const services: Service[] = data.services.map((s) => ({
    name: s.name,
    type: s.type as ServiceType,
    public: s.public ?? false,
    handlesPII: s.handlesPII ?? false,
    network: s.network.map((n) => ({
      host: n.host,
      port: n.port,
      protocol: n.protocol as Protocol
    })),
    dependsOn: s.dependsOn ?? [],
    resourceLimits: s.resourceLimits
  }));

  const ir: ConfigIR = {
    services,
    metadata: {
      sourceFormat: format,
      rawHash: hash
    }
  };

  return { ir, errors };
}

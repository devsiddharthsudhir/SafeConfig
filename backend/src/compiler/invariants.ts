// src/compiler/invariants.ts
import { ConfigIR, Service } from './ir';

export type Severity = 'low' | 'medium' | 'high';

export interface InvariantViolation {
  id: string;
  description: string;
  serviceName: string;
  severity: Severity;
}

// R1: DB must not be public/open to 0.0.0.0
function ruleNoPublicDatabases(service: Service): InvariantViolation | null {
  if (service.type !== 'db') return null;

  const hasPublicBinding = service.network.some(
    (n) => n.host === '0.0.0.0' || service.public
  );

  if (!hasPublicBinding) return null;

  return {
    id: 'R1_NO_PUBLIC_DB',
    description:
      'Database service is exposed publicly (host=0.0.0.0 or marked public). Databases should not be directly reachable from the internet.',
    serviceName: service.name,
    severity: 'high'
  };
}

// R2: public services must have HTTPS
function rulePublicServicesRequireTLS(
  service: Service
): InvariantViolation | null {
  if (!service.public) return null;

  const hasHttps = service.network.some((n) => n.protocol === 'https');
  if (hasHttps) return null;

  const hasHttp = service.network.some((n) => n.protocol === 'http');
  if (!hasHttp) return null;

  return {
    id: 'R2_PUBLIC_REQUIRES_TLS',
    description:
      'Publicly exposed service listens on HTTP without any HTTPS endpoint. Public services must have TLS enabled.',
    serviceName: service.name,
    severity: 'high'
  };
}

// R3: services handling PII must not be marked public
function ruleNoPIIPublicExposure(service: Service): InvariantViolation | null {
  if (!service.handlesPII) return null;
  if (!service.public) return null;

  return {
    id: 'R3_NO_PII_PUBLIC',
    description:
      'Service that handles PII is marked as public. PII-handling services should not be directly exposed to the internet.',
    serviceName: service.name,
    severity: 'high'
  };
}

// R4: every service must have resource limits defined
function ruleResourceLimitsDefined(
  service: Service
): InvariantViolation | null {
  const limits = service.resourceLimits;
  if (limits && limits.cpu !== undefined && limits.memoryMb !== undefined) {
    return null;
  }

  return {
    id: 'R4_RESOURCE_LIMITS',
    description:
      'Service is missing CPU or memory limits. Resource limits are required for predictable capacity and to prevent noisy-neighbour issues.',
    serviceName: service.name,
    severity: 'medium'
  };
}

const RULES = [
  ruleNoPublicDatabases,
  rulePublicServicesRequireTLS,
  ruleNoPIIPublicExposure,
  ruleResourceLimitsDefined
];

export function checkInvariants(ir: ConfigIR): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  for (const svc of ir.services) {
    for (const rule of RULES) {
      const v = rule(svc);
      if (v) violations.push(v);
    }
  }

  return violations;
}

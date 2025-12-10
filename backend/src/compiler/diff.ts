// src/compiler/diff.ts
import { InvariantViolation } from './invariants';
import { ConfigIR } from './ir';

export type RiskImpact = 'risk_increase' | 'risk_decrease' | 'neutral';

export interface ServiceChange {
  serviceName: string;
  messages: string[];
  riskImpact: RiskImpact;
}

export interface DiffSummary {
  totalNewViolations: number;
  totalResolvedViolations: number;
}

export interface DiffResult {
  summary: DiffSummary;
  changes: ServiceChange[];
}

function indexByService(
  violations: InvariantViolation[]
): Map<string, InvariantViolation[]> {
  const map = new Map<string, InvariantViolation[]>();
  for (const v of violations) {
    const arr = map.get(v.serviceName) ?? [];
    arr.push(v);
    map.set(v.serviceName, arr);
  }
  return map;
}

export function diffConfigs(
  oldIR: ConfigIR,
  newIR: ConfigIR,
  oldViolations: InvariantViolation[],
  newViolations: InvariantViolation[]
): DiffResult {
  const oldIndex = indexByService(oldViolations);
  const newIndex = indexByService(newViolations);

  let totalNewViolations = 0;
  let totalResolvedViolations = 0;

  const changes: ServiceChange[] = [];

  const allServiceNames = new Set<string>([
    ...oldIR.services.map((s) => s.name),
    ...newIR.services.map((s) => s.name)
  ]);

  for (const name of allServiceNames) {
    const oldVs = oldIndex.get(name) ?? [];
    const newVs = newIndex.get(name) ?? [];

    const oldCount = oldVs.length;
    const newCount = newVs.length;

    if (oldCount === 0 && newCount === 0) {
      continue;
    }

    const messages: string[] = [];

    if (oldCount === 0 && newCount > 0) {
      totalNewViolations += newCount;
      messages.push(`${newCount} new violation(s) introduced.`);
    } else if (oldCount > 0 && newCount === 0) {
      totalResolvedViolations += oldCount;
      messages.push(`${oldCount} violation(s) resolved.`);
    } else if (newCount !== oldCount) {
      if (newCount > oldCount) {
        totalNewViolations += newCount - oldCount;
        messages.push(
          `Violations increased from ${oldCount} to ${newCount}.`
        );
      } else {
        totalResolvedViolations += oldCount - newCount;
        messages.push(
          `Violations decreased from ${oldCount} to ${newCount}.`
        );
      }
    } else {
      messages.push(`Violations count unchanged (${newCount}).`);
    }

    if (newVs.length > 0) {
      messages.push(
        'Current violations: ' +
          newVs.map((v) => `${v.id} (${v.severity})`).join(', ')
      );
    }

    let riskImpact: RiskImpact = 'neutral';
    if (newCount > oldCount) riskImpact = 'risk_increase';
    else if (newCount < oldCount) riskImpact = 'risk_decrease';

    changes.push({
      serviceName: name,
      messages,
      riskImpact
    });
  }

  return {
    summary: {
      totalNewViolations,
      totalResolvedViolations
    },
    changes
  };
}

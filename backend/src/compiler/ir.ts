// src/compiler/ir.ts

export type ServiceType = 'api' | 'db' | 'queue' | 'cache';
export type Protocol = 'http' | 'https' | 'tcp';

export interface NetworkBinding {
  host: string; // e.g. "0.0.0.0", "internal", "10.0.0.5"
  port: number;
  protocol: Protocol;
}

export interface ResourceLimits {
  cpu?: number;     // cores
  memoryMb?: number;
}

export interface Service {
  name: string;
  type: ServiceType;
  public: boolean;
  handlesPII: boolean;
  network: NetworkBinding[];
  dependsOn: string[];
  resourceLimits?: ResourceLimits;
}

export interface ConfigIR {
  services: Service[];
  metadata?: {
    sourceFormat: 'yaml' | 'json';
    rawHash?: string; // small hash of raw config for reference
  };
}

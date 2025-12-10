// src/App.tsx
import axios from 'axios';
import { useState } from 'react';
import './App.css';

type Severity = 'low' | 'medium' | 'high';

interface NetworkBinding {
  host: string;
  port: number;
  protocol: string;
}

interface Service {
  name: string;
  type: string;
  public: boolean;
  handlesPII: boolean;
  network: NetworkBinding[];
  dependsOn: string[];
}

interface InvariantViolation {
  id: string;
  description: string;
  serviceName: string;
  severity: Severity;
}

interface AnalysisResult {
  ir: {
    services: Service[];
  };
  violations: InvariantViolation[];
  errors?: string[];
}

type RiskImpact = 'risk_increase' | 'risk_decrease' | 'neutral';

interface ServiceChange {
  serviceName: string;
  messages: string[];
  riskImpact: RiskImpact;
}

interface DiffResult {
  summary: {
    totalNewViolations: number;
    totalResolvedViolations: number;
  };
  changes: ServiceChange[];
}

type Format = 'yaml' | 'json';

function App() {
  const [activeTab, setActiveTab] = useState<'analyze' | 'diff'>('analyze');

  const [singleConfig, setSingleConfig] = useState('');
  const [singleFormat, setSingleFormat] = useState<Format>('yaml');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);

  const [oldConfig, setOldConfig] = useState('');
  const [newConfig, setNewConfig] = useState('');
  const [diffFormat, setDiffFormat] = useState<Format>('yaml');
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  const backendBaseUrl = 'http://localhost:4000';

  const handleAnalyze = async () => {
    setAnalyzeError(null);
    setAnalysis(null);

    if (!singleConfig.trim()) {
      setAnalyzeError('Please paste a config first.');
      return;
    }

    try {
      setLoadingAnalyze(true);
      const res = await axios.post<AnalysisResult | { errors: string[] }>(
        `${backendBaseUrl}/api/analyze`,
        {
          config: singleConfig,
          format: singleFormat
        }
      );

      if ('ir' in res.data) {
        setAnalysis(res.data as AnalysisResult);
      } else {
        const errData = res.data as { errors: string[] };
        setAnalyzeError(errData.errors.join('\n'));
      }
    } catch (err: any) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.errors?.join('\n') ||
        err.message;
      setAnalyzeError(msg);
    } finally {
      setLoadingAnalyze(false);
    }
  };

  const handleDiff = async () => {
    setDiff(null);
    setDiffError(null);

    if (!oldConfig.trim() || !newConfig.trim()) {
      setDiffError('Please provide both old and new configs.');
      return;
    }

    try {
      setLoadingDiff(true);
      const res = await axios.post<
        { diff: DiffResult } | { errors: string[] }
      >(`${backendBaseUrl}/api/diff`, {
        oldConfig,
        newConfig,
        format: diffFormat
      });

      if ('diff' in res.data) {
        setDiff((res.data as any).diff as DiffResult);
      } else {
        const errData = res.data as { errors: string[] };
        setDiffError(errData.errors.join('\n'));
      }
    } catch (err: any) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.errors?.join('\n') ||
        err.message;
      setDiffError(msg);
    } finally {
      setLoadingDiff(false);
    }
  };

  const renderServicesTable = () => {
    if (!analysis) return null;
    if (!analysis.ir.services.length) return <p>No services parsed.</p>;

    return (
      <table className="sc-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Type</th>
            <th>Public?</th>
            <th>Handles PII?</th>
            <th>Depends On</th>
          </tr>
        </thead>
        <tbody>
          {analysis.ir.services.map((svc) => (
            <tr key={svc.name}>
              <td>{svc.name}</td>
              <td>{svc.type}</td>
              <td>{svc.public ? 'Yes' : 'No'}</td>
              <td>{svc.handlesPII ? 'Yes' : 'No'}</td>
              <td>{svc.dependsOn.join(', ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderViolations = () => {
    if (!analysis) return null;

    if (!analysis.violations.length) {
      return <p className="sc-ok">✅ No invariant violations found.</p>;
    }

    return (
      <div className="sc-violations">
        {analysis.violations.map((v, idx) => (
          <div
            key={idx}
            className={`sc-violation sc-violation-${v.severity}`}
          >
            <div className="sc-violation-header">
              <span className="sc-pill">{v.severity.toUpperCase()}</span>
              <span className="sc-violation-id">{v.id}</span>
              <span className="sc-violation-service">@ {v.serviceName}</span>
            </div>
            <p>{v.description}</p>
          </div>
        ))}
      </div>
    );
  };

  const renderDiff = () => {
    if (!diff) return null;

    return (
      <div className="sc-diff">
        <div className="sc-diff-summary">
          <h3>Risk summary</h3>
          <p>
            New violations introduced:{' '}
            <strong>{diff.summary.totalNewViolations}</strong>
          </p>
          <p>
            Violations resolved:{' '}
            <strong>{diff.summary.totalResolvedViolations}</strong>
          </p>
        </div>

        <div className="sc-diff-changes">
          {diff.changes.map((c, idx) => (
            <div
              key={idx}
              className={`sc-diff-card sc-diff-${c.riskImpact}`}
            >
              <h4>{c.serviceName}</h4>
              <p className="sc-diff-impact">
                Impact: {c.riskImpact.replace('_', ' ')}
              </p>
              <ul>
                {c.messages.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="sc-root">
      <header className="sc-header">
        <h1>SafeConfig Studio</h1>
        <p>Policy-aware config compiler &amp; drift-aware risk dashboard</p>
      </header>

      <div className="sc-tabs">
        <button
          className={activeTab === 'analyze' ? 'sc-tab active' : 'sc-tab'}
          onClick={() => setActiveTab('analyze')}
        >
          Single Config
        </button>
        <button
          className={activeTab === 'diff' ? 'sc-tab active' : 'sc-tab'}
          onClick={() => setActiveTab('diff')}
        >
          Diff / Drift
        </button>
      </div>

      {activeTab === 'analyze' && (
        <section className="sc-section">
          <div className="sc-row">
            <div className="sc-col">
              <label className="sc-label">
                Config (YAML or JSON)
                <textarea
                  className="sc-textarea"
                  value={singleConfig}
                  onChange={(e) => setSingleConfig(e.target.value)}
                  placeholder="Paste your infra config here..."
                  rows={18}
                />
              </label>

              <div className="sc-controls">
                <label>
                  Format:{' '}
                  <select
                    value={singleFormat}
                    onChange={(e) =>
                      setSingleFormat(e.target.value as Format)
                    }
                  >
                    <option value="yaml">YAML</option>
                    <option value="json">JSON</option>
                  </select>
                </label>

                <button
                  className="sc-button"
                  onClick={handleAnalyze}
                  disabled={loadingAnalyze}
                >
                  {loadingAnalyze ? 'Analyzing…' : 'Analyze config'}
                </button>
              </div>

              {analyzeError && (
                <pre className="sc-error">{analyzeError}</pre>
              )}
            </div>

            <div className="sc-col">
              <h2>Parsed Services</h2>
              {renderServicesTable()}
              <h2>Invariant Violations</h2>
              {renderViolations()}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'diff' && (
        <section className="sc-section">
          <div className="sc-row">
            <div className="sc-col">
              <label className="sc-label">
                Old Config
                <textarea
                  className="sc-textarea"
                  value={oldConfig}
                  onChange={(e) => setOldConfig(e.target.value)}
                  placeholder="Current production config…"
                  rows={12}
                />
              </label>

              <label className="sc-label">
                New Config
                <textarea
                  className="sc-textarea"
                  value={newConfig}
                  onChange={(e) => setNewConfig(e.target.value)}
                  placeholder="Proposed change (PR)…"
                  rows={12}
                />
              </label>

              <div className="sc-controls">
                <label>
                  Format:{' '}
                  <select
                    value={diffFormat}
                    onChange={(e) =>
                      setDiffFormat(e.target.value as Format)
                    }
                  >
                    <option value="yaml">YAML</option>
                    <option value="json">JSON</option>
                  </select>
                </label>

                <button
                  className="sc-button"
                  onClick={handleDiff}
                  disabled={loadingDiff}
                >
                  {loadingDiff ? 'Computing diff…' : 'Analyze drift'}
                </button>
              </div>

              {diffError && <pre className="sc-error">{diffError}</pre>}
            </div>

            <div className="sc-col">
              <h2>Drift &amp; Risk Delta</h2>
              {renderDiff()}
            </div>
          </div>
        </section>
      )}

      <footer className="sc-footer">
        <span>SafeConfig — prototype devtool by Siddharth Sudhir</span>
      </footer>
    </div>
  );
}

export default App;

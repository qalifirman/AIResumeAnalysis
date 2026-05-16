import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetJobs, apiGetApplications } from '../../api';
import type { Job, Application } from '../../types';

type ReportType = 'candidate_ranking' | 'match_analytics' | 'recruitment_funnel' | 'top_skills';
type ExportFormat = 'csv' | 'pdf';

interface RecentReport {
  id: string;
  name: string;
  jobTitle: string;
  format: ExportFormat;
  date: string;
  status: 'ready' | 'processing';
}

const REPORT_TYPES: { id: ReportType; icon: string; title: string; desc: string }[] = [
  { id: 'candidate_ranking', icon: 'trophy',      title: 'Candidate Ranking',   desc: 'Top candidates sorted by AI match score.' },
  { id: 'match_analytics',   icon: 'analytics',   title: 'Match Analytics',     desc: 'Detailed breakdown of skills vs requirements.' },
  { id: 'recruitment_funnel',icon: 'filter_alt',  title: 'Recruitment Funnel',  desc: 'Conversion rates from application to hire.' },
  { id: 'top_skills',        icon: 'psychology',  title: 'Top Skills',          desc: 'Most common skills across the applicant pool.' },
];

// ─── Export helpers ───────────────────────────────────────────────────────────

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function downloadPdf(title: string, rows: string[][]) {
  if (rows.length < 1) return;
  const headers = rows[0];
  const data    = rows.slice(1);
  const tableRows = data.map(row =>
    `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
  ).join('');
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:24px;margin:0}
  h1{font-size:18px;color:#4f46e5;margin:0 0 4px}
  .meta{font-size:10px;color:#888;margin:0 0 20px}
  table{width:100%;border-collapse:collapse}
  th{background:#4f46e5;color:#fff;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
  td{padding:7px 10px;border-bottom:1px solid #e5e7eb;vertical-align:top}
  tr:nth-child(even) td{background:#f5f5ff}
  @media print{@page{margin:1.5cm}body{padding:0}}
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="meta">Generated on ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}</p>
<table>
  <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
  <tbody>${tableRows}</tbody>
</table>
</body>
</html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (!win) { alert('Please allow pop-ups to download PDF.'); URL.revokeObjectURL(url); return; }
  win.addEventListener('load', () => { win.focus(); win.print(); });
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function buildCandidateRanking(apps: Application[], jobs: Job[]): string[][] {
  const jobMap: Record<string, string> = {};
  jobs.forEach(j => { jobMap[j.id] = j.title; });
  const header = ['Rank', 'Candidate', 'Email', 'Job Applied', 'Match Score', 'Skill Match', 'Years Exp', 'Status', 'Date Applied'];
  const rows = apps
    .sort((a, b) => b.match_score - a.match_score)
    .map((a, i) => [
      String(i + 1),
      a.applicant_name || '',
      a.applicant_email || '',
      a.job_title || jobMap[a.job_id] || '',
      `${Math.round(a.match_score * 100)}%`,
      `${Math.round(a.skill_match_score * 100)}%`,
      String(a.years_of_experience),
      a.status,
      new Date(a.created_at).toLocaleDateString(),
    ]);
  return [header, ...rows];
}

function buildMatchAnalytics(apps: Application[], jobs: Job[]): string[][] {
  const jobMap: Record<string, string> = {};
  jobs.forEach(j => { jobMap[j.id] = j.title; });
  const header = ['Candidate', 'Job', 'Overall Match', 'Skill Match', 'Text Similarity', 'Matched Skills', 'Missing Skills'];
  const rows = apps.map(a => [
    a.applicant_name || '',
    a.job_title || jobMap[a.job_id] || '',
    `${Math.round(a.match_score * 100)}%`,
    `${Math.round(a.skill_match_score * 100)}%`,
    `${Math.round(a.text_similarity * 100)}%`,
    (a.matched_skills || []).join('; '),
    (a.missing_skills || []).join('; '),
  ]);
  return [header, ...rows];
}

function buildFunnelReport(apps: Application[]): string[][] {
  const counts = { applied: 0, under_review: 0, shortlisted: 0, rejected: 0 };
  apps.forEach(a => { counts[a.status] = (counts[a.status] || 0) + 1; });
  const total = apps.length || 1;
  return [
    ['Stage', 'Count', 'Conversion %'],
    ['Applied',      String(counts.applied),      `${Math.round(counts.applied / total * 100)}%`],
    ['Under Review', String(counts.under_review),  `${Math.round(counts.under_review / total * 100)}%`],
    ['Shortlisted',  String(counts.shortlisted),   `${Math.round(counts.shortlisted / total * 100)}%`],
    ['Rejected',     String(counts.rejected),      `${Math.round(counts.rejected / total * 100)}%`],
  ];
}

function buildTopSkills(apps: Application[]): string[][] {
  const counts: Record<string, number> = {};
  apps.forEach(a => (a.matched_skills || []).forEach(s => { counts[s] = (counts[s] || 0) + 1; }));
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return [['Skill', 'Count'], ...sorted.map(([s, c]) => [s, String(c)])];
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ReportGeneration() {
  const { accessToken } = useAuth();
  const [jobs, setJobs]   = useState<Job[]>([]);
  const [apps, setApps]   = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  const [reportType,  setReportType]  = useState<ReportType>('candidate_ranking');
  const [jobFilter,   setJobFilter]   = useState('all');
  const [minScore,    setMinScore]    = useState(0);
  const [format,      setFormat]      = useState<ExportFormat>('csv');
  const [generating,  setGenerating]  = useState(false);
  const [history,     setHistory]     = useState<RecentReport[]>(() => {
    try { return JSON.parse(localStorage.getItem('report-history') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([apiGetJobs(accessToken), apiGetApplications(accessToken)])
      .then(([j, a]) => { setJobs(j); setApps(a); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accessToken]);

  const filteredApps = apps.filter(a => {
    const matchJob   = jobFilter === 'all' || a.job_id === jobFilter;
    const matchScore = a.match_score >= minScore / 100;
    return matchJob && matchScore;
  });

  const handleGenerate = () => {
    setGenerating(true);
    const jobLabel = jobFilter === 'all' ? 'All Jobs' : jobs.find(j => j.id === jobFilter)?.title || 'Unknown';
    const reportLabel = REPORT_TYPES.find(r => r.id === reportType)?.title || reportType;
    const filename = `${reportLabel.replace(/\s+/g, '_')}_${Date.now()}`;

    setTimeout(() => {
      let rows: string[][] = [];
      if (reportType === 'candidate_ranking')   rows = buildCandidateRanking(filteredApps, jobs);
      if (reportType === 'match_analytics')     rows = buildMatchAnalytics(filteredApps, jobs);
      if (reportType === 'recruitment_funnel')  rows = buildFunnelReport(filteredApps);
      if (reportType === 'top_skills')          rows = buildTopSkills(filteredApps);

      if (format === 'csv') downloadCsv(`${filename}.csv`, rows);
      if (format === 'pdf') downloadPdf(reportLabel, rows);

      const newEntry: RecentReport = {
        id: Date.now().toString(),
        name: `${reportLabel} #${Math.floor(Math.random() * 9000) + 1000}`,
        jobTitle: jobLabel,
        format,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        status: 'ready',
      };
      const updated = [newEntry, ...history].slice(0, 10);
      setHistory(updated);
      try { localStorage.setItem('report-history', JSON.stringify(updated)); } catch {}
      setGenerating(false);
    }, 800);
  };

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-8 pb-12">

      {/* Heading */}
      <div>
        <h1 className="page-title">Report Generation</h1>
        <p className="page-subtitle">Export insights, analytics, and candidate metrics for your recruitment pipeline.</p>
      </div>

      {/* Step 1 — Report type */}
      <section className="flex flex-col gap-4">
        <h3 className="text-white text-base font-bold px-1">1. Choose Report Type</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {REPORT_TYPES.map(r => (
            <button key={r.id} onClick={() => setReportType(r.id)}
              className={`group flex flex-col items-start gap-4 rounded-xl border-2 p-5 text-left transition-all relative overflow-hidden
                ${reportType === r.id
                  ? 'border-primary bg-surface-card shadow-glow'
                  : 'border-border-dark bg-surface-card hover:border-primary/40 hover:bg-surface-hover'}`}>
              {reportType === r.id && (
                <div className="absolute top-2 right-2">
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>check_circle</span>
                </div>
              )}
              <div className={`rounded-lg p-3 transition-colors
                ${reportType === r.id ? 'bg-primary/20 text-primary' : 'bg-surface-hover text-text-muted group-hover:bg-primary/10 group-hover:text-primary'}`}>
                <span className="material-symbols-outlined">{r.icon}</span>
              </div>
              <div>
                <h4 className="text-white font-bold text-sm mb-1">{r.title}</h4>
                <p className="text-text-muted text-xs leading-relaxed">{r.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Steps 2 & 3 side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Step 2 — Filters */}
        <section className="lg:col-span-2 flex flex-col gap-4">
          <h3 className="text-white text-base font-bold px-1">2. Filter Data</h3>
          <div className="bg-surface-card border border-border-dark rounded-xl p-6 flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Job Position</label>
                <div className="relative">
                  <select className="input-dark appearance-none pr-9"
                    value={jobFilter} onChange={e => setJobFilter(e.target.value)}>
                    <option value="all">All Positions</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none ms-sm">expand_more</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Data Scope</label>
                <div className="relative">
                  <select className="input-dark appearance-none pr-9">
                    <option>All Time</option>
                    <option>Last 30 Days</option>
                    <option>Last Quarter</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none ms-sm">calendar_month</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Min Match Score</label>
                <span className="text-sm font-bold text-primary">{minScore}%</span>
              </div>
              <input type="range" min={0} max={100} step={5} value={minScore}
                onChange={e => setMinScore(Number(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-primary bg-surface-hover" />
              <p className="text-xs text-text-muted">
                Only include candidates with match score ≥ {minScore}%.
                <span className="ml-2 text-white font-medium">{filteredApps.length} candidate{filteredApps.length !== 1 ? 's' : ''} match.</span>
              </p>
            </div>

            {/* Status checkboxes */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Candidate Status</label>
              <div className="flex flex-wrap gap-4">
                {(['applied', 'under_review', 'shortlisted', 'rejected'] as const).map(s => {
                  const count = filteredApps.filter(a => a.status === s).length;
                  return (
                    <label key={s} className="flex items-center gap-2 cursor-pointer">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold border
                        ${s === 'applied'      ? 'bg-blue-500/15 text-blue-400 border-blue-500/25'    : ''}
                        ${s === 'under_review' ? 'bg-amber-500/15 text-amber-500 border-amber-500/25' : ''}
                        ${s === 'shortlisted'  ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/25' : ''}
                        ${s === 'rejected'     ? 'bg-red-500/15 text-red-500 border-red-500/25'       : ''}`}>
                        {s.replace('_', ' ')}
                        <span className="ml-1 opacity-70">{count}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Step 3 — Export */}
        <section className="flex flex-col gap-4">
          <h3 className="text-white text-base font-bold px-1">3. Export &amp; Generate</h3>
          <div className="bg-surface-card border border-border-dark rounded-xl p-6 flex flex-col gap-6 h-full">
            <div className="flex flex-col gap-3">
              <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Format</label>
              <div className="flex gap-3">
                {(['csv', 'pdf'] as const).map(f => (
                  <label key={f} className="flex-1 cursor-pointer">
                    <input type="radio" name="format" value={f} checked={format === f}
                      onChange={() => setFormat(f)} className="sr-only peer" />
                    <div className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-all
                      ${format === f
                        ? 'border-primary bg-primary/15 text-white'
                        : 'border-border-dark bg-surface-hover text-text-muted hover:border-primary/30 hover:text-white'}`}>
                      <span className="material-symbols-outlined ms-sm">
                        {f === 'csv' ? 'table_view' : 'picture_as_pdf'}
                      </span>
                      {f.toUpperCase()}
                    </div>
                  </label>
                ))}
              </div>
              {format === 'pdf' && (
                <p className="text-xs text-amber-400 flex items-center gap-1">
                  <span className="material-symbols-outlined ms-sm">info</span>
                  PDF export opens the browser print dialog.
                </p>
              )}
            </div>

            <div className="p-4 rounded-xl bg-surface-hover border border-border-dark flex items-start gap-3">
              <span className="material-symbols-outlined text-primary ms-sm mt-0.5">info</span>
              <div>
                <p className="text-white text-sm font-medium">Estimated output</p>
                <p className="text-text-muted text-xs mt-0.5 leading-relaxed">
                  {filteredApps.length} records · {REPORT_TYPES.find(r => r.id === reportType)?.title}
                </p>
              </div>
            </div>

            <button onClick={handleGenerate} disabled={generating || loading || filteredApps.length === 0}
              className="mt-auto w-full btn-primary py-3 text-base disabled:opacity-50">
              {generating
                ? <><span className="material-symbols-outlined animate-spin ms-sm">refresh</span>Generating…</>
                : <><span className="material-symbols-outlined ms-sm">auto_awesome</span>Generate Report</>}
            </button>
          </div>
        </section>
      </div>

      {/* Recent reports */}
      {history.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="text-white text-base font-bold">Recent Reports</h3>
            <button onClick={() => { setHistory([]); localStorage.removeItem('report-history'); }}
              className="text-text-muted hover:text-red-400 text-sm transition-colors">Clear history</button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border-dark bg-surface-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-hover text-xs uppercase text-text-muted font-semibold border-b border-border-dark">
                <tr>
                  <th className="px-5 py-3">Report Name</th>
                  <th className="px-5 py-3">Job Position</th>
                  <th className="px-5 py-3">Date Generated</th>
                  <th className="px-5 py-3">Format</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark">
                {history.map(r => (
                  <tr key={r.id} className="hover:bg-surface-hover/50 transition-colors">
                    <td className="px-5 py-3 font-medium text-white flex items-center gap-3">
                      <div className="p-1.5 bg-primary/15 rounded-lg text-primary flex-shrink-0">
                        <span className="material-symbols-outlined ms-sm">description</span>
                      </div>
                      {r.name}
                    </td>
                    <td className="px-5 py-3 text-text-muted">{r.jobTitle}</td>
                    <td className="px-5 py-3 text-text-muted">{r.date}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border
                        ${r.format === 'csv'
                          ? 'bg-blue-500/15 text-blue-400 border-blue-500/25'
                          : 'bg-red-500/15 text-red-400 border-red-500/25'}`}>
                        {r.format.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="relative flex size-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
                        </span>
                        <span className="text-emerald-400 text-xs font-medium">Ready</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

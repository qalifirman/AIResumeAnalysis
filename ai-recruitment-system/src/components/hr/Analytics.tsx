import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetAnalytics } from '../../api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import type { AnalyticsData } from '../../types';

const STATUS_COLORS: Record<string, string> = {
  applied: '#3b82f6', under_review: '#eab308', shortlisted: '#22c55e', rejected: '#ef4444',
};

export function Analytics() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);
  const load = async () => {
    if (!accessToken) return;
    try { setData(await apiGetAnalytics(accessToken)); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="space-y-4"><div className="card-dark p-8 animate-pulse h-40" /><div className="card-dark p-8 animate-pulse h-64" /></div>;
  if (error) return <div className="p-4 bg-red-500/10 border border-red-500/25 rounded-xl text-red-400 text-sm">{error}</div>;
  if (!data) return null;

  const stats = [
    { label: 'Total jobs', value: data.totalJobs, icon: 'work', color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Applications', value: data.totalApplications, icon: 'description', color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'Avg match score', value: `${Math.round(data.avgMatchScore * 100)}%`, icon: 'psychology', color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Shortlisted', value: data.applicationsByStatus.shortlisted || 0, icon: 'thumb_up', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  ];

  const pieData = Object.entries(data.applicationsByStatus)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: k.replace('_', ' '), value: v }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-surface-card border border-border-dark rounded-xl px-3 py-2 text-xs text-white shadow-card">
        <p className="font-semibold">{payload[0]?.payload?.jobTitle || payload[0]?.name}</p>
        <p className="text-text-muted">{payload[0]?.value} applications</p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="page-title">Analytics</h2>
        <p className="page-subtitle">Hiring funnel overview and skill insights</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="card-dark p-5">
            <div className="flex items-center justify-between mb-3">
              <div className={`size-10 rounded-xl ${s.bg} flex items-center justify-center`}>
                <span className={`material-symbols-outlined ${s.color}`}>{s.icon}</span>
              </div>
            </div>
            <div className="text-2xl font-black text-white">{s.value}</div>
            <div className="text-xs text-text-muted mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Applications per job */}
        {data.applicationsPerJob.length > 0 && (
          <div className="card-dark p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Applications per job</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.applicationsPerJob} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="jobTitle" tick={{ fill: '#93adc8', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => v.length > 12 ? v.slice(0, 12) + '…' : v} />
                <YAxis tick={{ fill: '#93adc8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="count" fill="#2C097F" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Status breakdown */}
        {pieData.length > 0 && (
          <div className="card-dark p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Application status</h3>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75}
                    dataKey="value" stroke="none">
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={STATUS_COLORS[entry.name.replace(' ', '_')] || '#6b7280'} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {pieData.map(d => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <div className="size-2.5 rounded-full flex-shrink-0"
                      style={{ background: STATUS_COLORS[d.name.replace(' ', '_')] || '#6b7280' }} />
                    <span className="text-text-muted capitalize">{d.name}</span>
                    <span className="font-semibold text-white ml-auto">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Top skills */}
      {data.topSkills.length > 0 && (
        <div className="card-dark p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Top skills in applicant pool</h3>
          <div className="space-y-3">
            {data.topSkills.slice(0, 8).map((s, i) => {
              const max = data.topSkills[0].count;
              return (
                <div key={s.skill} className="flex items-center gap-3">
                  <span className="text-xs text-text-muted w-5 text-right flex-shrink-0">{i + 1}</span>
                  <span className="text-sm text-white w-32 flex-shrink-0">{s.skill}</span>
                  <div className="flex-1 h-1.5 bg-surface-hover rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${(s.count / max) * 100}%` }} />
                  </div>
                  <span className="text-xs text-text-muted w-8 text-right flex-shrink-0">{s.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

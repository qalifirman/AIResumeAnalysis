import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const app = new Hono().basePath('/server');
app.use('*', cors({
  origin: '*',
  allowHeaders: ['Authorization', 'Content-Type'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AI_SERVICE_URL = Deno.env.get('AI_SERVICE_URL') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const BUCKET = 'recruitai-resumes';

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b: any) => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: false });
  }
}
ensureBucket().catch(console.error);

async function verifyAuth(req: Request) {
  const token = req.headers.get('Authorization')?.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return (!user || error) ? null : user;
}

// ── AI scoring (calls Python service if available, falls back to basic) ───────

async function scoreMatch(payload: {
  resumeText: string;
  jobDescription: string;
  resumeSkills: string[];
  requiredSkills: string[];
  resumeYearsExp: number;
  requiredYearsExp: number;
}) {
  if (AI_SERVICE_URL) {
    try {
      const res = await fetch(`${AI_SERVICE_URL}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_text: payload.resumeText,
          job_description: payload.jobDescription,
          resume_skills: payload.resumeSkills,
          required_skills: payload.requiredSkills,
          resume_years_exp: payload.resumeYearsExp,
          required_years_exp: payload.requiredYearsExp,
        }),
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('AI service unavailable, using fallback:', e);
    }
  }

  // Fallback: basic skill overlap scoring
  const reqSkills = payload.requiredSkills.length > 0
    ? payload.requiredSkills
    : [];
  const resumeLower = new Set(payload.resumeSkills.map((s: string) => s.toLowerCase()));
  const matched = reqSkills.filter((s: string) => resumeLower.has(s.toLowerCase()));
  const missing = reqSkills.filter((s: string) => !resumeLower.has(s.toLowerCase()));
  const skillScore = reqSkills.length > 0 ? matched.length / reqSkills.length : 0.5;
  const expScore = payload.requiredYearsExp === 0 ? 1.0
    : Math.min(payload.resumeYearsExp / payload.requiredYearsExp, 1.0);
  const finalScore = Math.round(((skillScore * 0.7) + (expScore * 0.3)) * 100) / 100;

  return {
    match_score: finalScore,
    skill_match_score: skillScore,
    text_similarity: 0,
    experience_score: expScore,
    matched_skills: matched,
    missing_skills: missing,
    explanation: `Skill match: ${Math.round(skillScore * 100)}%. ${matched.length} of ${reqSkills.length} required skills found.`,
  };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/signup', async (c) => {
  try {
    const { email, password, name, role } = await c.req.json();
    if (!email || !password || !name || !role) return c.json({ error: 'Missing fields' }, 400);
    if (!['hr', 'applicant'].includes(role)) return c.json({ error: 'Invalid role' }, 400);
    const { data, error } = await supabase.auth.admin.createUser({
      email, password, user_metadata: { name, role }, email_confirm: true,
    });
    if (error) return c.json({ error: error.message }, 400);
    const { error: pe } = await supabase.from('profiles').insert({ id: data.user.id, email, name, role });
    if (pe) return c.json({ error: 'Profile creation failed' }, 500);
    return c.json({ user: { id: data.user.id, email, name, role } });
  } catch { return c.json({ error: 'Signup failed' }, 500); }
});

app.get('/user/profile', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error || !data) return c.json({ error: 'Profile not found' }, 404);
  return c.json({ profile: data });
});

app.put('/user/profile', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { name } = await c.req.json();
  const { data, error } = await supabase.from('profiles').update({ name }).eq('id', user.id).select().single();
  if (error) return c.json({ error: 'Update failed' }, 500);
  return c.json({ profile: data });
});

// ── Jobs ──────────────────────────────────────────────────────────────────────

app.get('/jobs', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { data, error } = await supabase.from('jobs').select('*').order('created_at', { ascending: false });
  if (error) return c.json({ error: 'Fetch failed' }, 500);
  const jobs = (data || []).map((j: any) => ({
    ...j,
    requirements: j.requirements || [],
    employment_type: j.employment_type || 'full-time',
  }));
  return c.json({ jobs });
});

app.post('/jobs', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const b = await c.req.json();
  const { data, error } = await supabase.from('jobs').insert({
    hr_id: user.id, title: b.title, description: b.description,
    requirements: b.requirements || [], salary_range: b.salary_range,
    department: b.department, employment_type: b.employment_type || 'full-time',
    required_years_exp: b.required_years_exp || 0, location: b.location, status: 'active',
  }).select().single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ job: { ...data, requirements: data.requirements || [] } });
});

app.put('/jobs/:id', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const b = await c.req.json();
  const { data, error } = await supabase.from('jobs').update({
    title: b.title, description: b.description, requirements: b.requirements || [],
    salary_range: b.salary_range, department: b.department,
    employment_type: b.employment_type, required_years_exp: b.required_years_exp,
    location: b.location,
  }).eq('id', c.req.param('id')).eq('hr_id', user.id).select().single();
  if (error) return c.json({ error: 'Update failed' }, 500);
  return c.json({ job: data });
});

app.delete('/jobs/:id', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { error } = await supabase.from('jobs').delete().eq('id', c.req.param('id')).eq('hr_id', user.id);
  if (error) return c.json({ error: 'Delete failed' }, 500);
  return c.json({ success: true });
});

// ── Resumes ───────────────────────────────────────────────────────────────────

app.post('/resumes/upload', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const form = await c.req.formData();
  const file = form.get('file') as File | null;
  if (!file) return c.json({ error: 'No file provided' }, 400);
  const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
  const path = `${user.id}/${Date.now()}.${ext}`;
  const bytes = await file.arrayBuffer();
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type, upsert: false,
  });
  if (error) return c.json({ error: `Upload failed: ${error.message}` }, 500);
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return c.json({ filePath: path, fileUrl: publicUrl });
});

app.post('/resumes', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const b = await c.req.json();
  await supabase.from('resumes').update({ is_active: false }).eq('user_id', user.id);
  const { data, error } = await supabase.from('resumes').insert({
    user_id: user.id, file_name: b.fileName, file_path: b.filePath,
    file_url: b.fileUrl, parsed_data: b.parsedData, is_active: true,
  }).select().single();
  if (error) return c.json({ error: 'Save failed' }, 500);
  return c.json({ resume: data });
});

app.get('/resumes', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { data, error } = await supabase.from('resumes').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) return c.json({ error: 'Fetch failed' }, 500);
  return c.json({ resumes: data || [] });
});

app.put('/resumes/:id/activate', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  await supabase.from('resumes').update({ is_active: false }).eq('user_id', user.id);
  const { error } = await supabase.from('resumes').update({ is_active: true })
    .eq('id', c.req.param('id')).eq('user_id', user.id);
  if (error) return c.json({ error: 'Activate failed' }, 500);
  return c.json({ success: true });
});

app.delete('/resumes/:id', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { data: r } = await supabase.from('resumes').select('file_path')
    .eq('id', c.req.param('id')).eq('user_id', user.id).single();
  if (r?.file_path) await supabase.storage.from(BUCKET).remove([r.file_path]);
  const { error } = await supabase.from('resumes').delete()
    .eq('id', c.req.param('id')).eq('user_id', user.id);
  if (error) return c.json({ error: 'Delete failed' }, 500);
  return c.json({ success: true });
});

// ── Applications ──────────────────────────────────────────────────────────────

app.post('/applications', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const b = await c.req.json();

  // Re-score on the server side using the AI service for accuracy
  let scores = {
    match_score: b.matchScore || 0,
    skill_match_score: b.skillMatchScore || 0,
    text_similarity: b.textSimilarity || 0,
    experience_score: 0,
    matched_skills: b.matchedSkills || [],
    missing_skills: b.missingSkills || [],
    explanation: b.explanation || '',
  };

  // If resume text and job description are provided, re-score with AI
  if (b.resumeText && b.jobDescription) {
    try {
      scores = await scoreMatch({
        resumeText: b.resumeText,
        jobDescription: b.jobDescription,
        resumeSkills: b.resumeSkills || [],
        requiredSkills: b.requiredSkills || [],
        resumeYearsExp: b.yearsOfExperience || 0,
        requiredYearsExp: b.requiredYearsExp || 0,
      });
    } catch (e) {
      console.warn('Scoring failed, using client scores:', e);
    }
  }

  const { data, error } = await supabase.from('applications').insert({
    job_id: b.jobId,
    applicant_id: user.id,
    resume_url: b.resumeUrl || null,
    status: 'applied',
    years_of_experience: b.yearsOfExperience || 0,
    match_score: scores.match_score,
    skill_match_score: scores.skill_match_score,
    text_similarity: scores.text_similarity,
    matched_skills: scores.matched_skills,
    missing_skills: scores.missing_skills,
    explanation: scores.explanation,
  }).select().single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ application: data });
});

app.get('/applications', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();

  let query = supabase.from('applications').select('*, jobs(*)');
  if (profile?.role === 'applicant') {
    query = query.eq('applicant_id', user.id);
  } else {
    const { data: myJobs } = await supabase.from('jobs').select('id').eq('hr_id', user.id);
    if (!myJobs?.length) return c.json({ applications: [] });
    query = query.in('job_id', myJobs.map((j: any) => j.id));
  }

  const { data, error } = await query.order('match_score', { ascending: false });
  if (error) return c.json({ error: 'Fetch failed' }, 500);

  // Fetch applicant profiles separately (no direct FK from applications to profiles)
  const applicantIds = [...new Set((data || []).map((a: any) => a.applicant_id))];
  const { data: profileRows } = applicantIds.length
    ? await supabase.from('profiles').select('id,name,email').in('id', applicantIds)
    : { data: [] };
  const profileMap = Object.fromEntries((profileRows || []).map((p: any) => [p.id, p]));

  const applications = (data || []).map((a: any) => ({
    id: a.id,
    job_id: a.job_id,
    applicant_id: a.applicant_id,
    resume_url: a.resume_url,
    status: a.status,
    years_of_experience: a.years_of_experience,
    match_score: a.match_score,
    skill_match_score: a.skill_match_score,
    text_similarity: a.text_similarity,
    matched_skills: a.matched_skills || [],
    missing_skills: a.missing_skills || [],
    explanation: a.explanation,
    created_at: a.created_at,
    applicant_name: profileMap[a.applicant_id]?.name || 'Unknown',
    applicant_email: profileMap[a.applicant_id]?.email || '',
    job_title: a.jobs?.title || 'Unknown position',
  }));
  return c.json({ applications });
});

app.put('/applications/:id', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { status } = await c.req.json();
  const { error } = await supabase.from('applications').update({ status }).eq('id', c.req.param('id'));
  if (error) return c.json({ error: 'Update failed' }, 500);
  return c.json({ success: true });
});

// ── Analytics ─────────────────────────────────────────────────────────────────

app.get('/analytics', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const { data: jobs } = await supabase.from('jobs').select('*').eq('hr_id', user.id);
  const jobList = jobs || [];

  if (!jobList.length) {
    return c.json({
      totalJobs: 0, totalApplications: 0, avgMatchScore: 0,
      applicationsByStatus: { applied: 0, under_review: 0, shortlisted: 0, rejected: 0 },
      applicationsPerJob: [], topSkills: [],
    });
  }

  const { data: apps } = await supabase.from('applications').select('*')
    .in('job_id', jobList.map((j: any) => j.id));
  const allApps = apps || [];

  const avg = allApps.length
    ? allApps.reduce((s: number, a: any) => s + (Number(a.match_score) || 0), 0) / allApps.length
    : 0;

  const skillCounts: Record<string, number> = {};
  jobList.forEach((j: any) => {
    (j.requirements || []).forEach((s: string) => {
      if (s) skillCounts[s] = (skillCounts[s] || 0) + 1;
    });
  });

  return c.json({
    totalJobs: jobList.length,
    totalApplications: allApps.length,
    avgMatchScore: Math.round(avg * 100) / 100,
    applicationsByStatus: {
      applied:      allApps.filter((a: any) => a.status === 'applied').length,
      under_review: allApps.filter((a: any) => a.status === 'under_review').length,
      shortlisted:  allApps.filter((a: any) => a.status === 'shortlisted').length,
      rejected:     allApps.filter((a: any) => a.status === 'rejected').length,
    },
    applicationsPerJob: jobList
      .map((j: any) => ({ jobId: j.id, jobTitle: j.title, count: allApps.filter((a: any) => a.job_id === j.id).length }))
      .sort((a: any, b: any) => b.count - a.count),
    topSkills: Object.entries(skillCounts)
      .map(([skill, count]) => ({ skill, count }))
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 10),
  });
});

Deno.serve(app.fetch);

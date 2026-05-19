import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiGeneratePracticeQuestions, apiGetResumes, type PracticeQuestionSet } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { fieldIcon } from '../../utils/job-fields';

export function InterviewPractice() {
  const { accessToken } = useAuth();
  const [practice, setPractice] = useState<PracticeQuestionSet | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadPractice = async (silent = false) => {
    if (!accessToken) return;
    silent ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const resumes = await apiGetResumes(accessToken);
      const hasParsedResume = resumes.some(resume =>
        resume.is_active && !!resume.parsed_data?.rawText
      ) || resumes.some(resume => !!resume.parsed_data?.rawText);
      if (!hasParsedResume) {
        setPractice(null);
        setError('Upload and activate a parsed resume first so practice can be tailored to your field.');
        return;
      }
      const generated = await apiGeneratePracticeQuestions(accessToken);
      setPractice(generated);
      setAnswers({});
      if (silent) toast.success('Practice questions refreshed.');
    } catch (e: any) {
      setError(e.message || 'Unable to generate practice questions.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadPractice(); }, [accessToken]);

  const correctCount = useMemo(() => {
    if (!practice) return 0;
    return practice.questions.filter((question, idx) => answers[idx] === question.answer).length;
  }, [answers, practice]);

  const answeredCount = practice ? practice.questions.filter((_, idx) => answers[idx] !== undefined).length : 0;
  const total = practice?.questions.length || 0;
  const pct = total ? Math.round((correctCount / total) * 100) : 0;

  const selectAnswer = (idx: number, choice: number) => {
    setAnswers(current => ({ ...current, [idx]: choice }));
  };

  const resetAnswers = () => setAnswers({});

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="h-9 bg-surface-card rounded-xl animate-pulse w-64" />
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-surface-card border border-border-dark rounded-xl p-5 animate-pulse h-40" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto bg-surface-card border border-border-dark rounded-xl p-8 text-center">
        <span className="material-symbols-outlined ms-lg text-amber-400 mb-3 block">upload_file</span>
        <h2 className="text-xl font-bold text-white mb-2">Resume Needed for Practice</h2>
        <p className="text-sm text-text-muted leading-relaxed mb-5">{error}</p>
        <button onClick={() => loadPractice(true)} disabled={refreshing} className="btn-primary mx-auto">
          <span className={`material-symbols-outlined ms-sm ${refreshing ? 'animate-spin' : ''}`}>
            {refreshing ? 'refresh' : 'auto_awesome'}
          </span>
          Try Again
        </button>
      </div>
    );
  }

  if (!practice) return null;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="page-title">Interview Practice</h2>
          <p className="page-subtitle">
            Auto-tailored from {practice.resumeFileName || 'your active resume'}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-surface-card border border-border-dark">
            <p className="text-xs text-text-muted">Score</p>
            <p className="text-lg font-black text-white">{pct}%</p>
          </div>
          <button onClick={resetAnswers} className="btn-secondary h-11">
            <span className="material-symbols-outlined ms-sm">restart_alt</span>
            Reset Answers
          </button>
          <button onClick={() => loadPractice(true)} disabled={refreshing} className="btn-primary h-11">
            <span className={`material-symbols-outlined ms-sm ${refreshing ? 'animate-spin' : ''}`}>
              {refreshing ? 'refresh' : 'auto_awesome'}
            </span>
            New AI Set
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-surface-card border border-border-dark rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="material-symbols-outlined text-primary">{fieldIcon(practice.field)}</span>
            <div>
              <p className="text-xs text-text-muted">Detected Field</p>
              <h3 className="text-white font-bold">{practice.field}</h3>
            </div>
          </div>
          <p className="text-sm text-text-muted">
            Confidence {Math.round((practice.confidence || 0) * 100)}% based on your resume skills and experience.
          </p>
        </div>

        <div className="lg:col-span-2 bg-surface-card border border-border-dark rounded-xl p-5">
          <h3 className="font-bold text-white mb-3">Practice Focus</h3>
          <div className="flex flex-wrap gap-2">
            {(practice.focusSkills.length ? practice.focusSkills : [practice.field]).map(skill => (
              <span key={skill} className="px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/25 text-violet-300 text-xs font-semibold">
                {skill}
              </span>
            ))}
            <span className="px-2.5 py-1 rounded-lg bg-surface-hover border border-border-dark text-text-muted text-xs">
              {practice.is_fallback ? 'Fallback generator' : `${practice.ai_provider || 'AI'} generated`}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 space-y-4">
          {practice.questions.map((question, idx) => {
            const selected = answers[idx];
            const isRevealed = selected !== undefined;
            return (
              <article key={`${question.prompt}-${idx}`} className="bg-surface-card border border-border-dark rounded-xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <span className="px-2.5 py-1 rounded-lg bg-surface-hover border border-border-dark text-xs font-semibold text-text-muted">
                    {question.focus}
                  </span>
                  <span className="text-xs text-text-muted">Question {idx + 1} of {practice.questions.length}</span>
                </div>
                <h3 className="text-white font-bold leading-relaxed mb-4">{question.prompt}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {question.options.map((option, choiceIdx) => {
                    const isSelected = selected === choiceIdx;
                    const isCorrect = question.answer === choiceIdx;
                    const stateClass = isRevealed && isCorrect
                      ? 'border-green-500/40 bg-green-500/10 text-green-300'
                      : isRevealed && isSelected
                        ? 'border-red-500/40 bg-red-500/10 text-red-300'
                        : isSelected
                          ? 'border-primary/40 bg-primary/10 text-white'
                          : 'border-border-dark bg-bg-dark text-slate-300 hover:border-border-mid hover:text-white';
                    return (
                      <button
                        key={`${option}-${choiceIdx}`}
                        onClick={() => selectAnswer(idx, choiceIdx)}
                        className={`min-h-14 text-left rounded-xl border px-4 py-3 text-sm transition-colors ${stateClass}`}
                      >
                        <span className="font-semibold mr-2">{String.fromCharCode(65 + choiceIdx)}.</span>
                        {option}
                      </button>
                    );
                  })}
                </div>
                {isRevealed && (
                  <div className="mt-4 rounded-xl bg-surface-hover border border-border-dark p-4">
                    <p className="text-sm font-semibold text-white mb-1">
                      {selected === question.answer ? 'Correct answer' : 'Review answer'}
                    </p>
                    <p className="text-sm text-text-muted leading-relaxed">{question.explanation}</p>
                  </div>
                )}
              </article>
            );
          })}
        </section>

        <aside className="space-y-4">
          <div className="bg-surface-card border border-border-dark rounded-xl p-5">
            <h3 className="font-bold text-white mb-4">Practice Progress</h3>
            <div className="flex items-end gap-2 mb-3">
              <span className="text-3xl font-black text-white">{correctCount}</span>
              <span className="text-sm text-text-muted mb-1">of {total} correct</span>
            </div>
            <div className="h-2 rounded-full bg-surface-hover overflow-hidden mb-3">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${total ? (answeredCount / total) * 100 : 0}%` }} />
            </div>
            <p className="text-xs text-text-muted">{answeredCount} answered from your generated set.</p>
          </div>

          <div className="bg-surface-card border border-border-dark rounded-xl p-5">
            <h3 className="font-bold text-white mb-3">How It Works</h3>
            <p className="text-sm text-text-muted leading-relaxed">
              The system reads your active resume, detects your strongest field, then uses your AI provider to generate practice questions around your actual skills.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

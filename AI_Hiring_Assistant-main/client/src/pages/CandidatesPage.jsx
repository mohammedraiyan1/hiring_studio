import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Note, Spinner, Textarea } from '../components/ui';
import { IconArrowLeft, IconPlus, IconScale, IconTrash, IconUsers } from '../components/icons';
import Scorecard from '../components/Scorecard';

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = (interviewer = '') => ({
  name: '',
  email: '',
  phone: '',
  experience: '',
  currentRole: '',
  skills: [],
  resumeUrl: '',
  interviewer,
  interviewDate: today(),
  notes: '',
  status: 'pending',
  scores: {},
});

function ScoreRing({ percentage }) {
  const value = percentage ?? 0;
  const tone = value >= 80 ? 'text-good' : value >= 60 ? 'text-series-1' : 'text-warning';

  return (
    <div className="relative grid h-14 w-14 shrink-0 place-items-center">
      <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="#2c2c2a" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * 97.4} 97.4`}
          className={tone}
        />
      </svg>
      <span className="absolute text-[12px] font-semibold numeric">
        {percentage === null ? '—' : `${Math.round(value)}%`}
      </span>
    </div>
  );
}

function CandidateRow({ roleId, candidate, onEdit, onDelete }) {
  const { totals } = candidate.evaluation;

  return (
    <li className="flex items-center gap-4 px-5 py-4">
      <ScoreRing percentage={totals.weightedPercentage} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14.5px] font-semibold text-ink">{candidate.name}</p>
          {!totals.complete ? <Badge tone="warning">partial score</Badge> : null}
          {totals.evidenceCompleteness < 60 ? <Badge tone="warning">thin evidence</Badge> : null}
        </div>
        <p className="mt-1 text-[12.5px] text-muted">
          {[
            candidate.interviewer && `Interviewed by ${candidate.interviewer}`,
            candidate.interviewDate,
            candidate.email,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p className="mt-1.5 text-[12.5px] text-ink-2 numeric">
          {totals.rawTotal}/{totals.rawMax} raw · weighted {totals.weightedPercentage ?? '—'}% · evidence on{' '}
          {totals.evidenceCompleteness}% of scores
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <Link to={`/jobs/${roleId}/candidates/${candidate.id}/interview`}>
          <Button size="sm">Interview</Button>
        </Link>
        <Button variant="secondary" size="sm" onClick={() => onEdit(candidate)}>
          Edit scores
        </Button>
        <button
          onClick={() => onDelete(candidate)}
          aria-label={`Delete ${candidate.name}`}
          className="rounded-lg p-2 text-muted transition-colors hover:bg-critical/10 hover:text-critical"
        >
          <IconTrash width={16} height={16} />
        </button>
      </div>
    </li>
  );
}

export default function CandidatesPage() {
  const params = useParams();
  const roleId = params.roleId ?? params.jobId;
  const { notify } = useToast();

  const [role, setRole] = useState(null);
  const [candidates, setCandidates] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(false);
  const [entryMode, setEntryMode] = useState('manual');
  const [resumeName, setResumeName] = useState('');
  const [error, setError] = useState('');

  const loadCandidates = useCallback(
    () => api.listCandidates(roleId).then(({ candidates: list }) => setCandidates(list)),
    [roleId],
  );

  useEffect(() => {
    Promise.all([api.getRole(roleId).then(({ role: loaded }) => setRole(loaded)), loadCandidates()]).catch(
      (requestError) => setError(requestError.message),
    );
  }, [roleId, loadCandidates]);

  function startNew() {
    const lastInterviewer = candidates?.at(-1)?.interviewer ?? '';
    setForm(emptyForm(lastInterviewer));
    setEntryMode('manual');
    setResumeName('');
    setEditing('new');
    setError('');
  }

  function startEdit(candidate) {
    setForm({
      name: candidate.name,
      email: candidate.email ?? '',
      phone: candidate.phone ?? '',
      experience: candidate.experience ?? '',
      currentRole: candidate.currentRole ?? '',
      skills: candidate.skills ?? [],
      resumeUrl: candidate.resumeUrl ?? '',
      interviewer: candidate.interviewer ?? '',
      interviewDate: candidate.interviewDate || today(),
      notes: candidate.notes ?? '',
      status: candidate.status || 'pending',
      scores: candidate.scores ?? {},
    });
    setEntryMode('manual');
    setResumeName('');
    setEditing(candidate.id);
    setError('');
  }

  async function parseResume(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setBusy(true);
    setResumeName(file.name);
    try {
      const upload = new FormData();
      upload.append('resume', file);
      const { extracted, extractionSource } = await api.parseResume(upload);
      setForm((current) => ({ ...current, ...extracted }));
      notify(
        extractionSource === 'gemini'
          ? 'Gemini analyzed the resume and filled the candidate details.'
          : 'Resume details detected locally. Review them before saving.',
        'success',
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  async function save(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (editing === 'new') await api.createCandidate(roleId, form);
      else await api.updateCandidate(editing, form);
      await loadCandidates();
      notify(`Saved ${form.name}.`, 'success');
      setEditing(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }


  async function remove(candidate) {
    if (!window.confirm(`Delete ${candidate.name}'s scorecard?`)) return;
    try {
      await api.deleteCandidate(candidate.id);
      await loadCandidates();
      notify(`Deleted ${candidate.name}.`, 'success');
    } catch (requestError) {
      notify(requestError.message, 'error');
    }
  }

  if (error && !role) return <Note tone="critical">{error}</Note>;

  if (!role || !candidates) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-20" />
        <div className="skeleton h-64" />
      </div>
    );
  }

  const dimensions = role.kit.rubric.dimensions;
  const scoredCount = Object.values(form.scores).filter((entry) => entry?.score).length;

  return (
    <div className="space-y-5">
      <Link to={`/roles/${roleId}`} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink-2">
        <IconArrowLeft width={15} height={15} />
        {role.kit.jobDescription.roleTitle || role.roleInput.roleTitle}
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">Candidates</h1>
          <p className="mt-1 text-[13.5px] text-ink-2">
            Score every candidate using the same {dimensions.length} criteria after each interview.
          </p>
        </div>
        <div className="flex gap-2">
          {candidates.length ? (
            <div className="flex gap-2">
              <Link to={`/jobs/${roleId}/ranking`}>
                <Button variant="secondary">
                  <IconScale width={16} height={16} />
                  Ranking dashboard
                </Button>
              </Link>
              {candidates.length > 1 ? (
                <Link to={`/roles/${roleId}/compare`}>
                  <Button variant="secondary">
                    Compare {candidates.length}
                  </Button>
                </Link>
              ) : null}
            </div>
          ) : null}
          <Button onClick={startNew}>
            <IconPlus width={16} height={16} />
            Add candidate
          </Button>
        </div>
      </header>

      {editing ? (
        <Card className="animate-fade-up">
          <CardHeader
            title={editing === 'new' ? 'New scorecard' : `Editing ${form.name || 'candidate'}`}
            icon={IconScale}
            subtitle={`${scoredCount} of ${dimensions.length} criteria scored`}
            action={
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            }
          />

          <form onSubmit={save}>
            {editing === 'new' ? (
              <div className="border-b border-line px-5 py-4">
                <p className="text-[13px] font-semibold text-ink">How do you want to add this candidate?</p>
                <p className="mt-1 text-[12.5px] text-muted">Choose manual entry or upload a resume, then review every detected field before saving.</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button type="button" variant={entryMode === 'manual' ? 'primary' : 'secondary'} size="sm" onClick={() => setEntryMode('manual')}>
                  Enter manually
                </Button>
                <label className={`inline-flex h-8 cursor-pointer items-center justify-center rounded-lg border px-3 text-[13px] font-medium ${entryMode === 'resume' ? 'border-accent bg-accent text-ink' : 'border-line bg-raised text-ink'}`}>
                  Upload resume
                  <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(event) => { setEntryMode('resume'); parseResume(event); }} />
                </label>
                {resumeName ? <span className="text-[12px] text-muted">{resumeName} parsed for review</span> : null}
                </div>
              </div>
            ) : null}
            <div className="grid gap-4 border-b border-line px-5 py-5 sm:grid-cols-2">
              <Field label="Candidate name" required>
                <Input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  required
                />
              </Field>
              <Field label="Email" hint="Optional.">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </Field>
              <Field label="Phone" hint="Optional.">
                <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </Field>
              <Field label="Years of experience" hint="Can be detected from a resume.">
                <Input value={form.experience} onChange={(event) => setForm({ ...form, experience: event.target.value })} />
              </Field>
              <Field label="Current / previous role">
                <Input value={form.currentRole} onChange={(event) => setForm({ ...form, currentRole: event.target.value })} />
              </Field>
              <Field label="Skills" hint="Comma separated.">
                <Input value={form.skills.join(', ')} onChange={(event) => setForm({ ...form, skills: event.target.value.split(',').map((skill) => skill.trim()).filter(Boolean) })} />
              </Field>
              <Field label="Interviewer" hint="Attribution makes leniency differences visible later.">
                <Input
                  value={form.interviewer}
                  onChange={(event) => setForm({ ...form, interviewer: event.target.value })}
                />
              </Field>
              <Field label="Interview date">
                <Input
                  type="date"
                  value={form.interviewDate}
                  onChange={(event) => setForm({ ...form, interviewDate: event.target.value })}
                />
              </Field>
            </div>

            {editing === 'new' && entryMode === 'resume' && resumeName ? (
              <div className="border-b border-line px-5 py-4">
                <Note tone="info" title="Detected details are editable">Check every field above before accepting the resume data and saving this candidate.</Note>
              </div>
            ) : null}

            <Scorecard
              dimensions={dimensions}
              scores={form.scores}
              onChange={(scores) => setForm({ ...form, scores })}
            />

            {error ? (
              <div className="px-5 pt-4">
                <Note tone="critical">{error}</Note>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
              <p className="text-[12.5px] text-muted">
                Partial scorecards are allowed, and flagged as partial in the comparison.
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" type="button" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? <Spinner /> : null}
                  Save scorecard
                </Button>
              </div>
            </div>
          </form>
        </Card>
      ) : null}

      <Card>
        {candidates.length ? (
          <ul className="divide-y divide-line">
            {candidates.map((candidate) => (
              <CandidateRow key={candidate.id} roleId={roleId} candidate={candidate} onEdit={startEdit} onDelete={remove} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={IconUsers}
            title="No candidates scored yet"
            action={
              <Button onClick={startNew}>
                <IconPlus width={16} height={16} />
                Add the first candidate
              </Button>
            }
          >
            Add a candidate after each interview. Two or more scored candidates unlock the comparison view.
          </EmptyState>
        )}
      </Card>
    </div>
  );
}

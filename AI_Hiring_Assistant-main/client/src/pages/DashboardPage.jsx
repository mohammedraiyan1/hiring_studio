import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, EmptyState, Note, StatTile } from '../components/ui';
import { IconArrowRight, IconDashboard, IconPlus, IconSpark, IconTrash, IconUsers } from '../components/icons';

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function RoleCard({ role, onDelete, onDownload, onPublish }) {
  return (
    <Card className="group relative flex flex-col p-5 transition-colors hover:border-edge">
      <div className="flex items-start justify-between gap-3 pr-32">
        <div className="min-w-0">
          <Link to={`/roles/${role.id}`} className="block truncate text-[16px] font-semibold text-ink hover:text-accent">
            {role.roleTitle}
          </Link>
          <p className="mt-1 truncate text-[12.5px] text-muted">
            {[role.seniority, role.department, role.location].filter(Boolean).join(' · ') || 'No detail added'}
          </p>
        </div>
      </div>

      <div className="absolute right-6 top-6 flex items-start gap-1.5">
        <button
          type="button"
          onClick={() => onDownload(role)}
          className="inline-flex h-8 items-center justify-center rounded-lg bg-accent px-3 text-[13px] font-medium text-ink transition-all hover:brightness-95"
        >
          Download PDF
        </button>
        <button
          type="button"
          onClick={() => onDelete(role)}
          aria-label={`Delete ${role.roleTitle}`}
          className="grid h-8 w-8 place-items-center rounded-lg bg-raised p-2 text-muted transition-colors hover:bg-critical/10 hover:text-critical focus-visible:bg-critical/10 focus-visible:text-critical"
        >
          <IconTrash width={16} height={16} />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <Badge>{role.dimensionCount} rubric dimensions</Badge>
        <Badge>{role.questionCount} questions</Badge>
        <Badge tone={role.publicationStatus === 'published' ? 'good' : 'warning'}>{role.publicationStatus || 'draft'}</Badge>
        {role.generationSource === 'offline' ? <Badge tone="warning">offline</Badge> : null}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
        <Link
          to={`/roles/${role.id}/candidates`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-raised hover:text-ink"
        >
          <IconUsers width={15} height={15} />
          {role.candidateCount} {role.candidateCount === 1 ? 'candidate' : 'candidates'}
        </Link>
        {role.candidateCount > 1 ? (
          <>
            <Link
              to={`/roles/${role.id}/ranking`}
              className="inline-flex h-8 items-center rounded-lg px-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-raised hover:text-ink"
            >
              Ranking
            </Link>
            <Link
              to={`/roles/${role.id}/compare`}
              className="inline-flex h-8 items-center rounded-lg px-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-raised hover:text-ink"
            >
              Compare
            </Link>
          </>
        ) : null}
        <button type="button" onClick={() => onPublish(role)} className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[13px] font-medium text-ink-2 hover:bg-raised">{role.publicationStatus === 'published' ? 'Unpublish' : 'Publish vacancy'}</button>
        <Link to="/careers" className="inline-flex h-8 items-center rounded-lg px-2 text-[13px] text-muted hover:text-ink">Candidate portal</Link>
        <Link
          to={`/roles/${role.id}`}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-ink transition-all hover:brightness-95"
        >
          Open kit
          <IconArrowRight width={15} height={15} />
        </Link>
      </div>

      <p className="mt-3 text-[11px] text-muted">Created {formatDate(role.createdAt)}</p>
    </Card>
  );
}

export default function DashboardPage() {
  const [roles, setRoles] = useState(null);
  const [error, setError] = useState('');
  const { notify } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const load = useCallback(() => {
    api
      .listRoles()
      .then(({ roles: list }) => setRoles(list))
      .catch((requestError) => setError(requestError.message));
  }, []);

  useEffect(load, [load]);

  async function remove(role) {
    if (!window.confirm(`Delete "${role.roleTitle}" and its ${role.candidateCount} candidate scorecards?`)) return;
    try {
      await api.deleteRole(role.id);
      notify(`Deleted ${role.roleTitle}.`, 'success');
      load();
    } catch (requestError) {
      notify(requestError.message, 'error');
    }
  }

  async function togglePublication(role) {
    try {
      if (role.publicationStatus === 'published') await api.unpublishRole(role.id);
      else await api.publishRole(role.id);
      notify(role.publicationStatus === 'published' ? 'Vacancy unpublished.' : 'Vacancy published to the prototype careers portal.', 'success');
      load();
    } catch (requestError) { notify(requestError.message, 'error'); }
  }

  async function downloadPdf(role) {
    try {
      const { blob } = await api.downloadRolePdf(role.id);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${role.roleTitle}-job-description.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      notify('Job description PDF downloaded.', 'success');
    } catch (requestError) {
      notify(requestError.message, 'error');
    }
  }

  const totals = roles?.reduce(
    (accumulator, role) => ({
      candidates: accumulator.candidates + role.candidateCount,
    }),
    { candidates: 0 },
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Interviewer workspace</p>
          <h1 className="mt-2 text-[24px] font-semibold tracking-tight">Welcome back, {user?.name || 'interviewer'}</h1>
          <p className="mt-1 text-[13.5px] text-ink-2">
            Manage roles, candidates, interviews, and evaluation results from one workspace.
          </p>
        </div>
        <Button onClick={() => navigate('/roles/new')}>
          <IconPlus width={16} height={16} />
          New role
        </Button>
      </header>

      {error ? <Note tone="critical">{error}</Note> : null}

      {roles?.length ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Roles" value={roles.length} caption="Active hiring workflows" />
          <StatTile label="Candidates" value={totals.candidates} tone="accent" caption="Across your roles" />
        </div>
      ) : null}

      {roles === null ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="skeleton h-44" />
          ))}
        </div>
      ) : roles.length === 0 ? (
        <Card>
          <EmptyState
            icon={IconDashboard}
            title="No roles yet"
            action={
              <Button onClick={() => navigate('/roles/new')}>
                <IconSpark width={16} height={16} />
                Generate your first hiring kit
              </Button>
            }
          >
            Describe a role in a couple of sentences and you will get a job description, an interview script and a
            scoring rubric built around the same competencies.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {roles.map((role) => (
            <RoleCard key={role.id} role={role} onDelete={remove} onDownload={downloadPdf} onPublish={togglePublication} />
          ))}
        </div>
      )}
    </div>
  );
}

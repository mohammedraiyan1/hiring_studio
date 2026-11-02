import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button, Field, Input, Note, Spinner } from '../components/ui';
import { IconCheck } from '../components/icons';

const PROMISES = [
  'Structured job descriptions',
  'Role-specific interview questions',
  'Weighted evaluation rubrics',
  'Clear candidate comparisons',
];

export default function LoginPage({ initialMode = 'login' }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ name: '', company: '', email: '', password: '', inviteCode: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const registering = mode === 'register';
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (registering) await register(form);
      else await login({ email: form.email, password: form.password });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between border-r border-line bg-surface p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-ink shadow-sm">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 12h5l2-5 3 10 2-5h4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="text-[15px] font-semibold">NEX Recruit</p>
        </div>

        <div className="max-w-md">
          <h1 className="text-[34px] font-semibold leading-[1.15] tracking-tight">
            Structured hiring for every role.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
            Create a job description, interview plan, and evaluation rubric in one workspace.
          </p>

          <ul className="mt-8 space-y-3">
            {PROMISES.map((promise) => (
              <li key={promise} className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-ink-2">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-good/15 text-good">
                  <IconCheck width={13} height={13} />
                </span>
                {promise}
              </li>
            ))}
          </ul>
        </div>

        <p className="max-w-md text-[12px] leading-relaxed text-muted">Keep hiring decisions consistent, documented, and easy to review.</p>
      </section>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-[22px] font-semibold tracking-tight">
            {registering ? 'Create your account' : 'Sign in'}
          </h2>
          <p className="mt-1.5 text-[13px] text-ink-2">
            {registering ? 'Invited staff can access the NEX prototype recruitment workspace.' : 'Welcome back.'}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            {registering ? (
              <>
                <Field label="Your name" required>
                  <Input value={form.name} onChange={update('name')} autoComplete="name" required />
                </Field>
                <Field label="Company" hint="Used in the generated job descriptions.">
                  <Input value={form.company} onChange={update('company')} autoComplete="organization" />
                </Field>
                <Field label="Staff invitation code" required>
                  <Input value={form.inviteCode} onChange={update('inviteCode')} autoComplete="off" required />
                </Field>
              </>
            ) : null}

            <Field label="Work email" required>
              <Input type="email" value={form.email} onChange={update('email')} autoComplete="email" required />
            </Field>

            <Field label="Password" required hint={registering ? 'At least 12 characters.' : undefined}>
              <Input
                type="password"
                value={form.password}
                onChange={update('password')}
                autoComplete={registering ? 'new-password' : 'current-password'}
                required
              />
            </Field>

            {error ? <Note tone="critical">{error}</Note> : null}

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? <Spinner /> : null}
              {registering ? 'Join prototype workspace' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-6 text-center text-[13px] text-ink-2">
            {registering ? 'Already have an account?' : 'First time here?'}{' '}
            <button
              onClick={() => {
                setMode(registering ? 'login' : 'register');
                setError('');
              }}
              className="font-medium text-accent hover:underline"
            >
              {registering ? 'Sign in' : 'Create one'}
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}

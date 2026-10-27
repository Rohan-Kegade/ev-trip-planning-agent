import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthLayout, TextField, FormError } from '../components/AuthLayout';
import { PRIMARY_BUTTON } from '../styles';
import { useAuth } from '../auth';

const MIN_PASSWORD_LENGTH = 8;

export default function Signup() {
  const { user, signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/app" replace />;

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (form.password !== form.confirm) {
      setError('Passwords don’t match.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      await signup(form);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start planning EV trips in minutes"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-indigo-600 dark:text-indigo-300 hover:underline">Log in</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={error} />
        <TextField label="Name" id="name" type="text" autoComplete="name" required value={form.name} onChange={update} placeholder="Your name" />
        <TextField label="Email" id="email" type="email" autoComplete="email" required value={form.email} onChange={update} placeholder="you@example.com" />
        <TextField
          label="Password"
          id="password"
          type="password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={update}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        />
        <TextField label="Confirm password" id="confirm" type="password" autoComplete="new-password" required value={form.confirm} onChange={update} />
        <button type="submit" disabled={submitting} className={`${PRIMARY_BUTTON} w-full py-3`}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
}

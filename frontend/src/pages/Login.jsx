import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout, TextField, FormError } from '../components/AuthLayout';
import { PRIMARY_BUTTON } from '../styles';
import { useAuth } from '../auth';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = location.state?.from || '/app';
  if (user) return <Navigate to={redirectTo} replace />;

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(form);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to plan your next trip"
      footer={
        <>
          New to EVPilot?{' '}
          <Link to="/signup" className="font-semibold text-indigo-600 dark:text-indigo-300 hover:underline">Create an account</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={error} />
        <TextField label="Email" id="email" type="email" autoComplete="email" required value={form.email} onChange={update} placeholder="you@example.com" />
        <TextField label="Password" id="password" type="password" autoComplete="current-password" required value={form.password} onChange={update} />
        <button type="submit" disabled={submitting} className={`${PRIMARY_BUTTON} w-full py-3`}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </AuthLayout>
  );
}

import { createContext, useContext, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

// Client-side auth for local development: accounts live in localStorage.
// signup/login/logout are async so they can be swapped for real API calls
// (e.g. POST /auth/signup, /auth/login) without touching the pages.
const USERS_KEY = 'evpilot_users';
const SESSION_KEY = 'evpilot_session';

const readJSON = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

const writeJSON = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage unavailable
  }
};

const hashPassword = async (password) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readJSON(SESSION_KEY, null));

  const startSession = (account) => {
    const session = { name: account.name, email: account.email };
    writeJSON(SESSION_KEY, session);
    setUser(session);
  };

  const signup = async ({ name, email, password }) => {
    const users = readJSON(USERS_KEY, {});
    const key = email.trim().toLowerCase();
    if (users[key]) throw new Error('An account with this email already exists.');

    const account = { name: name.trim(), email: key, passwordHash: await hashPassword(password) };
    writeJSON(USERS_KEY, { ...users, [key]: account });
    startSession(account);
  };

  const login = async ({ email, password }) => {
    const account = readJSON(USERS_KEY, {})[email.trim().toLowerCase()];
    if (!account || account.passwordHash !== (await hashPassword(password))) {
      throw new Error('Incorrect email or password.');
    }
    startSession(account);
  };

  const logout = () => {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // localStorage unavailable
    }
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, signup, login, logout }}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

// Sends signed-out visitors to /login, then back to where they were going
export function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

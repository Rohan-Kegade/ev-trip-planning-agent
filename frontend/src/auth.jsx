import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { apiRequest } from './api';
import { clearConversationCache } from './conversationCache';

// Session ({ token, user }) from the backend's /auth endpoints, kept in localStorage
const SESSION_KEY = 'evpilot_session';

const readSession = () => {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY));
    return session?.token ? session : null;
  } catch {
    return null;
  }
};

const writeSession = (session) => {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // localStorage unavailable
  }
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession);

  const saveSession = useCallback((next) => {
    writeSession(next);
    setSession(next);
  }, []);

  // Also drops chats cached in memory, so the next account in this tab never sees them
  const logout = useCallback(() => {
    clearConversationCache();
    saveSession(null);
  }, [saveSession]);

  // Check a stored token is still valid (it may have expired or the server secret changed)
  const storedToken = session?.token;
  useEffect(() => {
    if (!storedToken) return;
    apiRequest('/auth/me', { token: storedToken })
      .then((user) => saveSession({ token: storedToken, user }))
      .catch((err) => {
        if (err.status === 401) logout();
      });
  }, [storedToken, saveSession, logout]);

  const signup = async ({ name, email, password }) => {
    saveSession(await apiRequest('/auth/signup', { body: { name, email, password } }));
  };

  const login = async ({ email, password }) => {
    saveSession(await apiRequest('/auth/login', { body: { email, password } }));
  };

  // For protected API calls: attaches the token and signs out if it's rejected.
  // Stable while the token is, so pages can load data with it in an effect.
  const authRequest = useCallback(async (path, options = {}) => {
    try {
      return await apiRequest(path, { ...options, token: storedToken });
    } catch (err) {
      if (err.status === 401) logout();
      throw err;
    }
  }, [storedToken, logout]);

  const updateProfile = async ({ name }) => {
    const user = await authRequest('/auth/me', { method: 'PATCH', body: { name } });
    saveSession({ ...session, user });
  };

  const changePassword = async ({ currentPassword, newPassword }) => {
    await authRequest('/auth/password', { body: { current_password: currentPassword, new_password: newPassword } });
  };

  const deleteAccount = async ({ password }) => {
    await authRequest('/auth/me', { method: 'DELETE', body: { password } });
    logout();
  };

  const value = { user: session?.user ?? null, signup, login, logout, authRequest, updateProfile, changePassword, deleteAccount };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
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

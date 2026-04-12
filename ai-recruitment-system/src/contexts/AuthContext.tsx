import React, { createContext, useContext, useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { publicAnonKey, supabaseUrl } from '../utils/supabase/info';
import { apiGetProfile, apiSignup } from '../api';
import type { User } from '../types';

const supabase = createClient(supabaseUrl, publicAnonKey);

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, role: 'hr' | 'applicant') => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (token: string): Promise<boolean> => {
    try {
      const profile = await apiGetProfile(token);
      setUser(profile);
      return true;
    } catch {
      setUser(null);
      return false;
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          const ok = await fetchProfile(data.session.access_token);
          if (ok) setAccessToken(data.session.access_token);
          else await supabase.auth.signOut();
        }
      } catch (e) {
        console.error('Session check error:', e);
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, []);

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    if (data?.session?.access_token) {
      setAccessToken(data.session.access_token);
      const ok = await fetchProfile(data.session.access_token);
      if (!ok) {
        await supabase.auth.signOut();
        setAccessToken(null);
        throw new Error('Login succeeded but profile could not be loaded. Is the backend running?');
      }
    }
  };

  const signup = async (email: string, password: string, name: string, role: 'hr' | 'applicant') => {
    await apiSignup(email, password, name, role, publicAnonKey);
    await login(email, password);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setAccessToken(null);
  };

  const refreshProfile = async () => {
    if (accessToken) await fetchProfile(accessToken);
  };

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, signup, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

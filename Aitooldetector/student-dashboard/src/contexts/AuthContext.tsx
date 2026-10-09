import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';

interface Student {
  id: string;
  sapId: string;
  name: string;
  branch: string;
  email?: string;
}

interface AuthContextType {
  student: Student | null;
  token: string | null;
  loading: boolean;
  login: (sapId: string, password: string) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  logout: () => void;
}

interface SignupData {
  sapId: string;
  name: string;
  branch: string;
  email?: string;
  password: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [student, setStudent] = useState<Student | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('accessToken'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
      api.get('/student/profile')
        .then(res => setStudent(res.data))
        .catch(() => {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (sapId: string, password: string) => {
    const res = await api.post('/auth/signin', { sapId, password });
    localStorage.setItem('accessToken', res.data.accessToken);
    localStorage.setItem('refreshToken', res.data.refreshToken);
    setToken(res.data.accessToken);
    setStudent(res.data.student);
  };

  const signup = async (data: SignupData) => {
    await api.post('/auth/signup', data);
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setToken(null);
    setStudent(null);
  };

  return (
    <AuthContext.Provider value={{ student, token, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

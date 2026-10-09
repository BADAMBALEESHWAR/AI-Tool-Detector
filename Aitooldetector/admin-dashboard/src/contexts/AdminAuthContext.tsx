import React, { createContext, useContext, useState } from 'react';
import { api } from '../lib/api';

interface Admin {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AdminAuthContextType {
  admin: Admin | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<any>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(() => {
    const stored = localStorage.getItem('adminData');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(localStorage.getItem('adminToken'));
  const [loading] = useState(false);

  const signup = async (name: string, email: string, password: string) => {
    const res = await api.post('/auth/admin/signup', { name, email, password });
    return res.data;
  };

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/admin/signin', { email, password });
    localStorage.setItem('adminToken', res.data.token);
    localStorage.setItem('adminData', JSON.stringify(res.data.admin));
    setToken(res.data.token);
    setAdmin(res.data.admin);
  };

  const logout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminData');
    setToken(null);
    setAdmin(null);
  };

  return (
    <AdminAuthContext.Provider value={{ admin, token, loading, login, signup, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Shield, UserPlus, LogIn, ArrowRight, User, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import Toast from '@/components/ui/Toast';
import { useNostr } from '@/contexts/NostrContext';

export default function LoginPage() {
  const router = useRouter();
  const { login, register, session } = useNostr();
  const [view, setView] = useState<'initial' | 'login' | 'register'>('initial');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (session.isAuthenticated) {
      router.push('/messages');
    }
  }, [session.isAuthenticated, router]);

  const handleLogin = async () => {
    if (!username || !password) return;
    setIsLoading(true);
    const result = await login(username, password);
    setIsLoading(false);
    if (result.success) {
      router.push('/messages');
    } else {
      setToast({ message: result.error || 'Login failed', type: 'error' });
    }
  };

  const handleRegister = async () => {
    if (!username || !password) return;
    setIsLoading(true);
    const result = await register(username, password);
    setIsLoading(false);
    if (result.success) {
      setToast({ message: 'Account registered! You can now login.', type: 'success' });
      setView('login');
    } else {
      setToast({ message: result.error || 'Registration failed', type: 'error' });
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-emerald-200">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-zinc-900">dodo-box</h1>
          <p className="text-zinc-500 text-sm">Decentralized Account Management</p>
        </div>

        <div className="space-y-4">
          {view === 'initial' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <button
                data-testid="method-login"
                onClick={() => setView('login')}
                className="w-full group flex items-center gap-4 p-4 bg-white rounded-2xl border border-zinc-200 hover:border-emerald-500 transition-all shadow-sm"
              >
                <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <LogIn className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-zinc-900">Login to Account</div>
                  <div className="text-xs text-zinc-500">Derive from username &amp; password</div>
                </div>
                <ArrowRight className="w-5 h-5 ml-auto text-zinc-300 group-hover:text-emerald-500 transition-colors" />
              </button>

              <button
                data-testid="method-register"
                onClick={() => setView('register')}
                className="w-full group flex items-center gap-4 p-4 bg-white rounded-2xl border border-zinc-200 hover:border-emerald-500 transition-all shadow-sm"
              >
                <div className="w-12 h-12 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <UserPlus className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-zinc-900">Register Account</div>
                  <div className="text-xs text-zinc-500">Create new credentials on relay</div>
                </div>
                <ArrowRight className="w-5 h-5 ml-auto text-zinc-300 group-hover:text-emerald-500 transition-colors" />
              </button>
            </motion.div>
          )}

          {(view === 'login' || view === 'register') && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4 bg-white p-6 rounded-3xl border border-zinc-200 shadow-xl"
            >
              <h2 className="text-xl font-bold text-zinc-900">
                {view === 'login' ? 'Account Login' : 'Account Registration'}
              </h2>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 uppercase ml-1">Username</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      data-testid="username-input"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter username"
                      className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-100 rounded-xl text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 uppercase ml-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      data-testid="password-input"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      onKeyDown={(e) => e.key === 'Enter' && (view === 'login' ? handleLogin() : handleRegister())}
                      className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-100 rounded-xl text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setView('initial')}
                  className="flex-1 px-4 py-3 rounded-xl font-semibold text-zinc-500 bg-zinc-100 hover:bg-zinc-200 transition-colors"
                >
                  Back
                </button>
                <button
                  data-testid="submit-btn"
                  onClick={view === 'login' ? handleLogin : handleRegister}
                  disabled={!username || !password || isLoading}
                  className="flex-[2] px-4 py-3 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-200 flex items-center justify-center"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    view === 'login' ? 'Login' : 'Register'
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <Toast
        isVisible={!!toast}
        message={toast?.message || ''}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </main>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { useMounted } from '@/hooks/use-mounted';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Shield, UserPlus, LogIn, ArrowRight, User, Lock, Moon, Sun, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import Toast from '@/components/ui/Toast';
import { useNostr } from '@/contexts/NostrContext';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import { version } from '@/package.json';

export default function LoginPage() {
  const router = useRouter();
  const { login, register, session } = useNostr();
  const { i18n } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const [view, setView] = useState<'initial' | 'login' | 'register'>('initial');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const mounted = useMounted();

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
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6">
      {mounted && (
        <div className="fixed top-4 right-4 flex items-center gap-2 z-50">
          <button
            onClick={() => {
              const next = i18n.language === 'en' ? 'zh' : 'en';
              i18n.changeLanguage(next);
              try {
                localStorage.setItem('dodobox_language', next);
              } catch (err) {
                console.warn('[Login] Failed to save language to localStorage:', err);
              }
            }}
            className="p-2 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors shadow-sm"
            aria-label="Toggle language"
          >
            <Globe className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="p-2 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors shadow-sm"
            aria-label="Toggle theme"
          >
            {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      )}
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-emerald-200 dark:shadow-none">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-zinc-900 dark:text-zinc-100">dodo-box</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">Decentralized Account Management</p>
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
                className="w-full group flex items-center gap-4 p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500 transition-all shadow-sm"
              >
                <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <LogIn className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100">Login to Account</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Derive from username &amp; password</div>
                </div>
                <ArrowRight className="w-5 h-5 ml-auto text-zinc-300 group-hover:text-emerald-500 transition-colors" />
              </button>

              <button
                data-testid="method-register"
                onClick={() => setView('register')}
                className="w-full group flex items-center gap-4 p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500 transition-all shadow-sm"
              >
                <div className="w-12 h-12 bg-zinc-50 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-600 dark:text-zinc-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <UserPlus className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100">Register Account</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Create new credentials on relay</div>
                </div>
                <ArrowRight className="w-5 h-5 ml-auto text-zinc-300 group-hover:text-emerald-500 transition-colors" />
              </button>
            </motion.div>
          )}

          {(view === 'login' || view === 'register') && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4 bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl"
            >
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                {view === 'login' ? 'Account Login' : 'Account Registration'}
              </h2>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase ml-1">Username</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      data-testid="username-input"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter username"
                      className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase ml-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      data-testid="password-input"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      onKeyDown={(e) => e.key === 'Enter' && (view === 'login' ? handleLogin() : handleRegister())}
                      className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setView('initial')}
                  className="flex-1 px-4 py-3 rounded-xl font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
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

      <div className="fixed bottom-4 right-4 text-[10px] font-mono text-zinc-300 dark:text-zinc-600 select-none pointer-events-none">
        v{version}
      </div>
    </main>
  );
}

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  UserCircle, LogOut, Globe, Moon, Shield, 
  Trash2, Download, ChevronRight, Plus, 
  Share2, QrCode, Edit2, X, Check, Clock, ChevronLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import SwipeableListItem from '@/components/ui/SwipeableListItem';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Toast from '@/components/ui/Toast';
import { cn, encodeIdentityInfo } from '@/lib/utils';

interface Identity {
  id: string;
  name: string;
  active: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);
  const [identities, setIdentities] = useState<Identity[]>([
    { id: '1', name: 'default', active: true },
    { id: '2', name: 'work', active: false },
    { id: '3', name: 'anon', active: false },
  ]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const activeIdentity = identities.find(i => i.active);

  const handleLogout = () => {
    localStorage.removeItem('doracle_unlocked');
    router.push('/login');
  };

  const switchIdentity = (id: string) => {
    setIdentities(prev => prev.map(i => ({ ...i, active: i.id === id })));
    setToast({ message: `Switched to identity: ${identities.find(i => i.id === id)?.name}`, type: 'success' });
  };

  const deleteIdentity = (id: string) => {
    const identity = identities.find(i => i.id === id);
    if (identity?.active) {
      setToast({ message: "Cannot delete active identity", type: 'error' });
      return;
    }
    setIdentities(prev => prev.filter(i => i.id !== id));
    setConfirmDelete(null);
    setToast({ message: "Identity deleted", type: 'success' });
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-50">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-zinc-100 px-4 h-16 flex items-center justify-between">
        <h1 className="text-xl font-display font-bold text-zinc-900">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Identity Section */}
        <section className="space-y-3">
          <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Identity Management</div>
          <button 
            onClick={() => setIsIdentityModalOpen(true)}
            className="w-full flex items-center gap-4 p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm hover:border-emerald-500 transition-all group"
          >
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <UserCircle className="w-7 h-7" />
            </div>
            <div className="text-left flex-1">
              <div className="font-bold text-zinc-900">{activeIdentity?.name}</div>
              <div className="text-xs text-zinc-500">Switch or manage accounts</div>
            </div>
            <ChevronRight className="w-5 h-5 text-zinc-300 group-hover:text-emerald-500 transition-colors" />
          </button>
          
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 p-4 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-bold">Logout Session</span>
          </button>
        </section>

        {/* Preferences */}
        <section className="space-y-3">
          <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Preferences</div>
          <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
            <div className="lang-switcher flex items-center justify-between p-4 border-b border-zinc-50">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-zinc-400" />
                <span className="text-sm font-medium">Language</span>
              </div>
              <div className="flex bg-zinc-100 p-1 rounded-lg">
                <button className="px-3 py-1 text-[10px] font-bold bg-white rounded shadow-sm">EN</button>
                <button className="px-3 py-1 text-[10px] font-bold text-zinc-400">ZH</button>
              </div>
            </div>
            <div className="theme-menu flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Moon className="w-5 h-5 text-zinc-400" />
                <span className="text-sm font-medium">Dark Mode</span>
              </div>
              <div className="w-10 h-5 bg-zinc-200 rounded-full relative">
                <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full shadow-sm" />
              </div>
            </div>
          </div>
        </section>

        {/* Network & Data */}
        <section className="space-y-3">
          <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Network & Data</div>
          <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
            <div className="relay-list p-4 border-b border-zinc-50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-zinc-400" />
                  <span className="text-sm font-medium">Relays</span>
                </div>
                <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded uppercase">3 Connected</span>
              </div>
              <div className="space-y-2">
                <div className="relay-item text-xs font-mono text-zinc-500 bg-zinc-50 p-2 rounded-lg flex items-center justify-between">
                  <span>wss://relay.doracle.io</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                </div>
              </div>
            </div>
            <div className="ttl-input-group p-4 border-b border-zinc-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-zinc-400" />
                <span className="text-sm font-medium">Message TTL</span>
              </div>
              <span className="text-sm font-bold text-zinc-900">30 Days</span>
            </div>
            <div className="p-4 flex gap-2">
              <button className="btn-secondary flex-1 flex items-center justify-center gap-2 py-2.5 bg-zinc-100 text-zinc-600 rounded-xl text-xs font-bold hover:bg-zinc-200 transition-colors">
                <Download className="w-4 h-4" /> Export
              </button>
              <button className="btn-danger flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100 transition-colors">
                <Trash2 className="w-4 h-4" /> Clear
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Identity Management Full-screen Dialog */}
      <AnimatePresence>
        {isIdentityModalOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-50 bg-white flex flex-col"
          >
            <header className="px-4 h-16 flex items-center justify-between border-b border-zinc-100">
              <div className="flex items-center gap-3">
                <button onClick={() => setIsIdentityModalOpen(false)} className="p-2 -ml-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <ChevronLeft className="w-6 h-6 text-zinc-600" />
                </button>
                <h2 className="header-title text-xl font-display font-bold text-zinc-900">Identities</h2>
              </div>
              <div className="flex gap-2">
                <button className="btn-text text-[10px] font-bold text-emerald-600 uppercase tracking-widest px-2 py-1">Import</button>
                <button className="btn-accent-pill bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full shadow-lg shadow-emerald-200">New</button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Active Hero */}
              <div className="identity-hero bg-emerald-600 rounded-[32px] p-6 text-white shadow-2xl shadow-emerald-200 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                <div className="relative z-10 flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Active Identity</div>
                    <h3 className="identity-hero-name text-3xl font-display font-bold">{activeIdentity?.name}</h3>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(encodeIdentityInfo('mock_privkey'));
                        setToast({ message: 'Identity string copied', type: 'success' });
                      }}
                      className="p-3 bg-white/20 hover:bg-white/30 rounded-2xl backdrop-blur-md transition-colors"
                    >
                      <Share2 className="w-5 h-5" />
                    </button>
                    <button className="p-3 bg-white/20 hover:bg-white/30 rounded-2xl backdrop-blur-md transition-colors">
                      <QrCode className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Identity List */}
              <div className="identity-list space-y-3">
                <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Switch Identity</div>
                {identities.map((id) => (
                  <SwipeableListItem
                    key={id.id}
                    actions={[
                      { label: 'Edit', onClick: () => {}, className: 'bg-zinc-400' },
                      { label: 'Delete', onClick: () => setConfirmDelete(id.id), className: 'bg-red-500' },
                    ]}
                    className="rounded-2xl border border-zinc-100 overflow-hidden"
                  >
                    <button
                      onClick={() => switchIdentity(id.id)}
                      className={cn(
                        "w-full flex items-center gap-4 p-4 transition-all",
                        id.active ? "active bg-emerald-50/50" : "bg-white hover:bg-zinc-50"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                        id.active ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-400"
                      )}>
                        <Shield className="w-5 h-5" />
                      </div>
                      <span className={cn("font-bold", id.active ? "text-emerald-900" : "text-zinc-600")}>
                        {id.name}
                      </span>
                      {id.active && (
                        <div className="ml-auto w-6 h-6 bg-emerald-600 rounded-full flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                    </button>
                  </SwipeableListItem>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Delete Identity"
        message="Are you sure you want to delete this identity? All associated local data will be lost."
        onConfirm={() => confirmDelete && deleteIdentity(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />

      <Toast
        isVisible={!!toast}
        message={toast?.message || ''}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Search, Plus, Camera, Copy, Edit2, Trash2, X, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import SwipeableListItem from '@/components/ui/SwipeableListItem';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Toast from '@/components/ui/Toast';
import { cn, encodeContactInfo } from '@/lib/utils';

interface Contact {
  id: string;
  name: string;
  pubkey: string;
  avatar?: string;
}

const MOCK_CONTACTS: Contact[] = [
  { id: '1', name: 'Alice', pubkey: 'npub1alice...', avatar: 'https://picsum.photos/seed/alice/100/100' },
  { id: '2', name: 'Bob', pubkey: 'npub1bob...', avatar: 'https://picsum.photos/seed/bob/100/100' },
  { id: '3', name: 'Charlie', pubkey: 'npub1charlie...', avatar: 'https://picsum.photos/seed/charlie/100/100' },
];

export default function ContactsPage() {
  const [search, setSearch] = useState('');
  const [contacts, setContacts] = useState(MOCK_CONTACTS);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [contactInput, setContactInput] = useState('');
  const [error, setError] = useState('');
  
  // Dialog & Toast States
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCopy = (contact: Contact) => {
    const protocolStr = encodeContactInfo(contact.pubkey);
    navigator.clipboard.writeText(protocolStr);
    setToast({ message: 'Contact info copied to clipboard', type: 'success' });
  };

  const handleDelete = (id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id));
    setConfirmDelete(null);
    setToast({ message: 'Contact removed', type: 'success' });
  };

  const handleAddContact = () => {
    if (!contactInput.startsWith('doracle://contact/')) {
      setError('Invalid contact protocol string');
      return;
    }
    // Mock add
    const newContact: Contact = {
      id: Date.now().toString(),
      name: 'New Friend',
      pubkey: 'npub' + Math.random().toString(36).substring(7),
      avatar: `https://picsum.photos/seed/${Math.random()}/100/100`
    };
    setContacts(prev => [newContact, ...prev]);
    setIsAddModalOpen(false);
    setContactInput('');
    setError('');
    setToast({ message: 'Contact added successfully', type: 'success' });
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-zinc-100 px-4 h-16 flex items-center justify-between">
        <h1 className="text-xl font-display font-bold text-zinc-900">Contacts</h1>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center hover:bg-emerald-100 transition-colors"
        >
          <Plus className="w-6 h-6" />
        </button>
      </header>

      {/* Search */}
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts..."
            className="search-input w-full pl-10 pr-10 py-2.5 bg-zinc-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 transition-all"
          />
          {search && (
            <button 
              onClick={() => setSearch('')}
              className="search-clear absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-200 rounded-full transition-colors"
            >
              <X className="w-3 h-3 text-zinc-500" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="contacts-container flex-1 overflow-y-auto">
        {filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-400 space-y-2">
            <Users className="w-12 h-12 opacity-20" />
            <p className="text-sm">No contacts found</p>
          </div>
        ) : (
          filteredContacts.map((contact) => (
            <SwipeableListItem
              key={contact.id}
              actions={[
                { label: 'Edit', onClick: () => setEditingContact(contact), className: 'bg-zinc-400' },
                { label: 'Copy', onClick: () => handleCopy(contact), className: 'bg-emerald-500' },
                { label: 'Delete', onClick: () => setConfirmDelete(contact.id), className: 'bg-red-500' },
              ]}
            >
              <div className="flex items-center gap-4 p-4">
                <div className="w-12 h-12 rounded-2xl overflow-hidden bg-zinc-100 border border-zinc-100 relative">
                  <Image src={contact.avatar || ''} alt={contact.name} fill className="object-cover" referrerPolicy="no-referrer" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-zinc-900 truncate">{contact.name}</div>
                  <div className="text-xs text-zinc-400 truncate font-mono">{contact.pubkey}</div>
                </div>
              </div>
            </SwipeableListItem>
          ))
        )}
      </div>

      {/* Modals & Dialogs */}
      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Remove Contact"
        message="Are you sure you want to remove this contact? This action cannot be undone."
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />

      <Toast
        isVisible={!!toast}
        message={toast?.message || ''}
        type={toast?.type}
        onClose={() => setToast(null)}
      />

      {/* Add Contact Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddModalOpen(false)}
              className="backdrop absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="modal-content relative w-full max-w-md bg-white rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-zinc-900">Add Contact</h2>
                <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="form-group space-y-2">
                  <label className="text-xs font-semibold text-zinc-500 uppercase ml-1">Contact Identity String</label>
                  <div className="relative">
                    <textarea
                      value={contactInput}
                      onChange={(e) => {
                        setContactInput(e.target.value);
                        setError('');
                      }}
                      placeholder="doracle://contact/..."
                      className="w-full h-32 px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none text-sm font-mono"
                    />
                    <button className="btn-cam absolute right-3 bottom-3 p-2 bg-white shadow-sm border border-zinc-100 rounded-xl text-zinc-400 hover:text-emerald-600 transition-colors">
                      <Camera className="w-5 h-5" />
                    </button>
                  </div>
                  {error && <p className="text-xs text-red-500 ml-1">{error}</p>}
                </div>

                <button
                  onClick={handleAddContact}
                  className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all active:scale-[0.98]"
                >
                  Add Contact
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Nickname Modal */}
      <AnimatePresence>
        {editingContact && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingContact(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-xs bg-white rounded-3xl p-6 shadow-2xl"
            >
              <h3 className="text-lg font-bold text-zinc-900 mb-4">Edit Nickname</h3>
              <input
                type="text"
                defaultValue={editingContact.name}
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-xl mb-6 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setEditingContact(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-zinc-500 bg-zinc-100"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setToast({ message: 'Nickname updated', type: 'success' });
                    setEditingContact(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-emerald-600"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

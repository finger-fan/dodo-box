'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useContacts } from '@/hooks/nostr/use-contacts';

interface AddContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
}

export default function AddContactModal({ isOpen, onClose, onAdded }: AddContactModalProps) {
  const { t } = useTranslation();
  const { addContact } = useContacts();
  const [contactInput, setContactInput] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    setContactInput('');
    setError('');
    onClose();
  };

  const handleAddContact = async () => {
    const input = contactInput.trim();
    if (!input) {
      setError('Please enter a contact string or npub');
      return;
    }

    // Accept dodobox://identity/ protocol, legacy dodobox://contact/, bare npub1, or hex pubkey
    if (!input.startsWith('dodobox://identity/') && !input.startsWith('dodobox://contact/') && !input.startsWith('npub1') && !input.match(/^[0-9a-f]{64}$/i)) {
      setError(t('contacts.invalid_protocol', 'Paste an identity sharing string'));
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await addContact(input);
      if (result.success) {
        handleClose();
        onAdded();
      } else {
        setError(result.error || 'Failed to add contact');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="backdrop absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            data-testid="add-contact-modal"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="modal-content relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{t('contacts.add_contact')}</h2>
              <button onClick={handleClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="form-group space-y-2">
                <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase ml-1">Contact Identity String</label>
                <div className="relative">
                  <textarea
                    value={contactInput}
                    onChange={(e) => {
                      setContactInput(e.target.value);
                      setError('');
                    }}
                    placeholder="dodobox://identity/npub1... or npub1..."
                    className="w-full h-32 px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-2xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none text-sm font-mono"
                  />
                </div>
                {error && <p className="text-xs text-red-500 ml-1">{error}</p>}
              </div>

              <button
                onClick={handleAddContact}
                disabled={isSubmitting}
                className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-200 dark:shadow-none hover:bg-emerald-700 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
              >
                {t('contacts.add_contact')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

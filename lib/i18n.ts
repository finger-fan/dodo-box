import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../public/locales/en.json';
import zh from '../public/locales/zh.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
    fallbackLng: 'zh',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      // 默认中文;不读 navigator,用户手动切换后记忆(localStorage)
      order: ['localStorage'],
      lookupLocalStorage: 'dodobox_language',
      caches: ['localStorage'],
    },
  });

export default i18n;

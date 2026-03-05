import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Home, BarChart2, List as ListIcon, Globe, Download, Plus, Minus, ExternalLink, Search, X, Image as ImageIcon, Upload, Edit2, Trash2, Check, ArrowRight, Bookmark, Filter, Sparkles, Wand2, Sun, Moon, Star } from 'lucide-react';
import { supabase } from './services/supabaseClient';
import { Auth } from './components/Auth';
import { GoogleGenAI } from "@google/genai";

// --- Types ---
export type TitleStatus = 'Reading' | 'Completed' | 'Planned' | 'Dropped';

export interface Title {
  id: string;
  user_id?: string;
  title: string;
  type: string;
  status: TitleStatus;
  ch: number;
  total: number;
  cover: string;
  url: string;
  site: string;
  rating: number;
  tags: string[];
  fav: boolean;
  note: string;
  updated: number;
  latest_chapter?: number;
  preferred_source?: string;
}

export interface LogEntry {
  id: string;
  titleId: string;
  title: string;
  from: number;
  to: number;
  delta: number;
  timestamp: number;
}

export interface Site {
  id: string;
  name: string;
  url: string;
  type: string;
}

export interface ReadingSession {
  id: string;
  title_id: string;
  chapter: number;
  site: string;
  opened_url: string;
  created_at: string;
}

export interface Recommendation {
  id: string;
  title: string;
  cover: string;
  tags: string[];
  source_title: string;
  score: number;
  section?: string;
  site_url?: string;
}

// --- Hooks ---

// --- Helpers ---
const generateId = () => Math.random().toString(36).substr(2, 9);
const getInitials = (title: string) => {
  if (!title) return '??';
  return title.split(/[\s-]+/).slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('');
};

function parseLink(url: string) {
  let siteName = '';
  let chapter = '';
  let slug = '';
  let title = '';

  try {
    const parsedUrl = new URL(url);
    siteName = parsedUrl.hostname.replace('www.', '');
    
    const chMatch = url.match(/chapter[- ]?(\d+(\.\d+)?)/i);
    if (chMatch) {
      chapter = chMatch[1];
    }

    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      const potentialSlug = pathParts[pathParts.length - 1];
      slug = potentialSlug.replace(/-chapter.*/i, '');
      title = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  } catch (e) {
    // Invalid URL
  }

  return { siteName, chapter, slug, title, url };
}

// --- Main App ---
export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (!supabase) return <div className="flex items-center justify-center min-h-screen text-red-500">Supabase environment variables are missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</div>;
  if (!session) return <Auth onAuthSuccess={() => {}} />;

  return <MainApp />;
}

function MainApp() {
  const [titles, setTitles] = useState<Title[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [readingSessions, setReadingSessions] = useState<ReadingSession[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  
  const [currentTab, setCurrentTab] = useState<'home' | 'stats' | 'log' | 'sites' | 'import' | 'recommendations'>('home');
  const [editingTitle, setEditingTitle] = useState<Partial<Title> | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string, message: string, onConfirm: () => void } | null>(null);
  
  // Theme State
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('manhwa-theme');
      if (saved === 'light' || saved === 'dark') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark');
    root.classList.add(`theme-${theme}`);
    localStorage.setItem('manhwa-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
  
  useEffect(() => {
    if (!supabase) return;
    const fetchData = async () => {
      const { data: titlesData } = await supabase.from('titles').select('*');
      const { data: logsData } = await supabase.from('logs').select('*');
      const { data: sitesData } = await supabase.from('sites').select('*');
      const { data: sessionsData } = await supabase.from('reading_sessions').select('*');
      const { data: recsData } = await supabase.from('recommendations').select('*');

      if (titlesData) setTitles(titlesData as Title[]);
      if (logsData) setLogs(logsData as LogEntry[]);
      if (sitesData) setSites(sitesData as Site[]);
      if (sessionsData) setReadingSessions(sessionsData as ReadingSession[]);
      if (recsData) setRecommendations(recsData as Recommendation[]);
    };
    fetchData();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  };

  // --- Actions ---
  const trackReadingSession = async (title: Title) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const session: Partial<ReadingSession> = {
      title_id: title.id,
      chapter: title.ch,
      site: title.site,
      opened_url: title.url,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase.from('reading_sessions').insert({ ...session, user_id: user.id }).select();
    if (data) setReadingSessions(prev => [data[0] as ReadingSession, ...prev]);
  };

  const addLog = async (log: LogEntry) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase.from('logs').insert({ ...log, user_id: user.id }).select();
    if (data) setLogs(prev => [data[0] as LogEntry, ...prev].slice(0, 500));
  };

  const updateChapter = async (id: string, delta: number) => {
    const title = titles.find(t => t.id === id);
    if (!title) return;
    const newCh = Math.max(0, title.ch + delta);
    
    let newStatus = title.status;
    if (newCh > title.ch && title.status === 'Planned') {
      newStatus = 'Reading';
    }

    const { data, error } = await supabase.from('titles').update({ ch: newCh, status: newStatus, updated: Date.now() }).eq('id', id).select();
    if (data) {
      setTitles(prev => prev.map(t => t.id === id ? data[0] as Title : t));
      if (newCh !== title.ch) {
        addLog({
          id: generateId(),
          titleId: id,
          title: title.title,
          from: title.ch,
          to: newCh,
          delta: newCh - title.ch,
          timestamp: Date.now()
        });
      }
    }
  };

  const saveTitle = async (titleData: Partial<Title>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (titleData.id) {
      // Update
      const { data, error } = await supabase.from('titles').update({ ...titleData, updated: Date.now() }).eq('id', titleData.id).select();
      if (data) setTitles(prev => prev.map(t => t.id === titleData.id ? data[0] as Title : t));
    } else {
      // Create
      const newTitle: Title = {
        
        user_id: user.id,
        title: titleData.title || 'Untitled',
        type: titleData.type || 'Manhwa',
        status: titleData.status || 'Reading',
        ch: titleData.ch || 0,
        total: titleData.total || 0,
        cover: titleData.cover || '',
        url: titleData.url || '',
        site: titleData.site || '',
        rating: titleData.rating || 0,
        tags: titleData.tags || [],
        fav: !!titleData.fav,
        note: titleData.note || '',
        updated: Date.now()
      };
      const { data, error } = await supabase.from('titles').insert(newTitle).select();
      if (data) setTitles(prev => [data[0] as Title, ...prev]);
    }
    setEditingTitle(null);
  };

  const deleteTitle = (id: string) => {
    setConfirmDialog({
      title: 'Delete Title',
      message: 'Are you sure you want to delete this title? This action cannot be undone.',
      onConfirm: async () => {
        const { error } = await supabase.from('titles').delete().eq('id', id);
        if (!error) {
          setTitles(prev => prev.filter(t => t.id !== id));
          setEditingTitle(null);
          showToast('Title deleted.');
        }
      }
    });
  };

  // --- Sub-components ---

  const Header = () => (
    <header className="sticky top-0 z-30 bg-header border-b border-divider px-4 py-3 flex items-center justify-between transition-colors">
      <div className="flex items-center gap-3">
        {/* Mobile: Show logo. Desktop: Sidebar handles nav, but we can show logo here too or just title. */}
        {/* User requested: "Left side: app logo + app name." */}
        <div className="w-8 h-8 bg-chip-active rounded-lg flex items-center justify-center text-white font-serif font-bold text-lg shadow-sm">M</div>
        <h1 className="font-serif font-bold text-xl text-primary">ManhwaVault</h1>
      </div>
      
      <div className="flex items-center gap-3 flex-wrap justify-end">
        <button onClick={() => setEditingTitle({})} className="btn-primary h-9 px-3 sm:px-4">
          <Plus size={18} /> <span className="hidden sm:inline">Add Title</span>
        </button>
        
        <button
          onClick={toggleTheme}
          className="relative w-12 h-6 rounded-full bg-chapter-btn transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mv-primary flex-shrink-0"
          aria-label="Toggle theme"
        >
          <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 flex items-center justify-center ${theme === 'dark' ? 'translate-x-6' : 'translate-x-0'}`}>
            {theme === 'dark' ? <Moon size={10} className="text-black" /> : <Sun size={10} className="text-amber-500" />}
          </div>
        </button>

        <button onClick={() => supabase.auth.signOut()} className="text-xs font-medium text-secondary hover:text-primary transition-colors whitespace-nowrap">
          Sign Out
        </button>
      </div>
    </header>
  );

    const TitleEditorModal = () => {
    if (!editingTitle) return null;

    const [formData, setFormData] = useState<Partial<Title>>({
      title: '', type: 'Manhwa', status: 'Reading', ch: 0, total: 0, cover: '', url: '', site: '', tags: [], ...editingTitle
    });
    const [tagInput, setTagInput] = useState('');
    const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
    const [loadingTags, setLoadingTags] = useState(false);

    const generateTags = async () => {
      if (!formData.title) return;
      setLoadingTags(true);
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Suggest 5 short, relevant tags (genres/themes) for the manhwa/manga/comic titled "${formData.title}". Return ONLY a comma-separated list of tags (e.g. Action, Fantasy, Isekai). Do not include numbering or extra text.`,
        });
        
        const text = response.text || '';
        const tags = text.split(',').map(t => t.trim()).filter(t => t.length > 0);
        setSuggestedTags(tags.slice(0, 5));
      } catch (e) {
        console.error("Tag generation failed", e);
        showToast("Failed to generate tags.");
      } finally {
        setLoadingTags(false);
      }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              setFormData(prev => ({ ...prev, cover: event.target?.result as string }));
            };
            reader.readAsDataURL(blob);
          }
        }
      }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setFormData(prev => ({ ...prev, cover: event.target?.result as string }));
        };
        reader.readAsDataURL(file);
      }
    };

    const addTag = () => {
      if (tagInput.trim() && !formData.tags?.includes(tagInput.trim().toLowerCase())) {
        setFormData(prev => ({ ...prev, tags: [...(prev.tags || []), tagInput.trim().toLowerCase()] }));
        setTagInput('');
      }
    };

    const removeTag = (tag: string) => {
      setFormData(prev => ({ ...prev, tags: prev.tags?.filter(t => t !== tag) }));
    };

    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onPaste={handlePaste}>
        <div className="bg-modal rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col border border-card transition-colors">
          <div className="sticky top-0 bg-modal border-b border-divider p-4 flex justify-between items-center z-10 transition-colors">
            <h2 className="font-serif font-semibold text-lg text-primary">{formData.id ? 'Edit Title' : 'Add Title'}</h2>
            <button onClick={() => setEditingTitle(null)} className="btn-ghost"><X size={20} /></button>
          </div>
          
          <div className="p-4 flex flex-col gap-4">
            {/* Cover Image Section */}
            <div className="flex gap-4 items-start">
              <div className="w-24 h-32 bg-chapter-btn rounded-lg overflow-hidden flex-shrink-0 border border-input relative flex items-center justify-center transition-colors">
                {formData.cover ? (
                  <img src={formData.cover} alt="Cover" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <ImageIcon className="text-secondary" size={32} />
                )}
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <label className="text-xs font-semibold text-secondary uppercase">Cover Image</label>
                <input 
                  type="text" 
                  placeholder="Image URL or paste image" 
                  className="w-full bg-input border border-input rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:border-focus placeholder-placeholder transition-colors"
                  value={formData.cover || ''}
                  onChange={e => setFormData(prev => ({ ...prev, cover: e.target.value }))}
                />
                <div className="relative">
                  <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileUpload} />
                  <button className="w-full btn-secondary">
                    <Upload size={16} /> Upload File
                  </button>
                </div>
              </div>
            </div>

            {/* Basic Info */}
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-secondary uppercase mb-1 block">Title</label>
                <input type="text" className="w-full bg-input border border-input rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:border-focus placeholder-placeholder transition-colors" value={formData.title || ''} onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))} />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-secondary uppercase mb-1 block">Chapter</label>
                  <input type="number" className="w-full bg-input border border-input rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:border-focus transition-colors" value={formData.ch || 0} onChange={e => setFormData(prev => ({ ...prev, ch: parseInt(e.target.value) || 0 }))} />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-semibold text-secondary uppercase mb-1 block">Status</label>
                  <select className="w-full bg-input border border-input rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:border-focus transition-colors" value={formData.status} onChange={e => setFormData(prev => ({ ...prev, status: e.target.value as TitleStatus }))}>
                    <option value="Reading">Reading</option>
                    <option value="Planned">Planned</option>
                    <option value="Completed">Completed</option>
                    <option value="Dropped">Dropped</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-secondary uppercase mb-1 block">Series URL</label>
                  <input type="url" className="w-full bg-input border border-input rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:border-focus placeholder-placeholder transition-colors" value={formData.url || ''} onChange={e => setFormData(prev => ({ ...prev, url: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-secondary uppercase mb-1 block">Site Name</label>
                  <input type="text" className="w-full bg-input border border-input rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:border-focus placeholder-placeholder transition-colors" value={formData.site || ''} onChange={e => setFormData(prev => ({ ...prev, site: e.target.value }))} />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-semibold text-secondary uppercase mb-1 block">Rating (0-10)</label>
                  <input 
                    type="number" 
                    min="0" 
                    max="10" 
                    step="0.1"
                    className="w-full bg-input border border-input rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:border-focus transition-colors" 
                    value={formData.rating || 0} 
                    onChange={e => setFormData(prev => ({ ...prev, rating: parseFloat(e.target.value) || 0 }))} 
                  />
                </div>
              </div>
              
              {/* Tags */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-secondary uppercase block">Tags</label>
                  <button 
                    onClick={generateTags} 
                    disabled={loadingTags || !formData.title}
                    className="text-xs text-link flex items-center gap-1 hover:underline disabled:opacity-50"
                  >
                    <Wand2 size={12} /> {loadingTags ? 'Generating...' : 'Suggest Tags'}
                  </button>
                </div>
                
                {suggestedTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2 p-2 bg-input rounded-lg border border-input transition-colors">
                    <span className="text-xs text-secondary w-full mb-1">Suggestions:</span>
                    {suggestedTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => {
                          if (!formData.tags?.includes(tag.toLowerCase())) {
                            setFormData(prev => ({ ...prev, tags: [...(prev.tags || []), tag.toLowerCase()] }));
                          }
                        }}
                        className="px-2 py-1 bg-chapter-btn border border-input rounded text-xs text-primary hover:border-link hover:text-link transition-colors"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 mb-2">
                  <input 
                    type="text" 
                    placeholder="Add tag..." 
                    className="flex-1 bg-input border border-input rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:border-focus placeholder-placeholder transition-colors"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  />
                  <button onClick={addTag} className="btn-secondary">Add</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {formData.tags?.map(tag => (
                    <span key={tag} className="flex items-center gap-1 bg-chip-active/10 text-link px-2 py-1 rounded-md text-xs font-medium border border-chip-default">
                      {tag} <button onClick={() => removeTag(tag)} className="opacity-50 hover:opacity-100"><X size={12} /></button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 bg-modal border-t border-divider p-4 flex justify-between items-center z-10 transition-colors">
            {formData.id ? (
              <button onClick={() => deleteTitle(formData.id!)} className="btn-ghost text-red-500 hover:text-red-600 hover:bg-red-500/10"><Trash2 size={20} /></button>
            ) : <div></div>}
            <button onClick={() => saveTitle(formData)} className="btn-primary">
              <Check size={18} /> Save
            </button>
          </div>
        </div>
      </div>
    );
  };

    const HomePage = () => {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<TitleStatus | 'All'>('All');
    const [tagFilter, setTagFilter] = useState<string | null>(null);
    const [linkInput, setLinkInput] = useState('');

    const processLink = () => {
      if (!linkInput.trim()) return;
      const parsed = parseLink(linkInput);
      
      // Duplicate detection
      const existing = titles.find(t => 
        (t.url && t.url === parsed.url) || 
        (t.title.toLowerCase() === parsed.title.toLowerCase() && parsed.title.length > 0)
      );

      if (existing) {
        const newCh = parseInt(parsed.chapter) || existing.ch;
        const updatedTitle = { ...existing, ch: newCh, url: parsed.url, updated: Date.now() };
        if (newCh > existing.ch) {
          addLog({
            id: generateId(),
            titleId: existing.id,
            title: existing.title,
            from: existing.ch,
            to: newCh,
            delta: newCh - existing.ch,
            timestamp: Date.now()
          });
          if (updatedTitle.status === 'Planned') updatedTitle.status = 'Reading';
        }
        setTitles(prev => prev.map(t => t.id === existing.id ? updatedTitle : t));
        setLinkInput('');
        showToast(`Updated existing title: ${existing.title} to Chapter ${newCh}`);
      } else {
        // Open modal prefilled
        setEditingTitle({
          title: parsed.title,
          ch: parseInt(parsed.chapter) || 0,
          url: parsed.url,
          site: parsed.siteName,
          status: 'Reading'
        });
        setLinkInput('');
      }
    };

    const handlePasteLink = (e: React.ClipboardEvent<HTMLInputElement>) => {
      // Optional: auto-process on paste
    };

    const filteredTitles = useMemo(() => {
      return titles.filter(t => {
        if (statusFilter !== 'All' && t.status !== statusFilter) return false;
        if (tagFilter && !t.tags.includes(tagFilter)) return false;
        if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }).sort((a, b) => b.updated - a.updated);
    }, [titles, statusFilter, tagFilter, search]);

    const quickResumeTitles = useMemo(() => {
      return [...titles].sort((a, b) => b.updated - a.updated).slice(0, 3);
    }, [titles]);

    const allTags = useMemo(() => {
      const tags = new Set<string>();
      titles.forEach(t => t.tags.forEach(tag => tags.add(tag)));
      return Array.from(tags).sort();
    }, [titles]);

    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        {/* Quick Resume */}
        {quickResumeTitles.length > 0 && !search && statusFilter === 'All' && !tagFilter && (
          <div className="mb-6">
            <h2 className="font-serif font-semibold text-lg mb-3 flex items-center gap-2 text-primary"><Bookmark size={18} className="text-secondary" /> Quick Resume</h2>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x">
              {quickResumeTitles.map(t => (
                <div key={`qr-${t.id}`} className="bg-card border border-card rounded-xl p-3 flex-shrink-0 w-64 snap-start shadow-sm flex items-center gap-3">
                  <div className="w-12 h-16 bg-chapter-btn rounded flex-shrink-0 overflow-hidden relative flex items-center justify-center">
                    {t.cover ? <img src={t.cover} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" /> : <span className="text-link font-serif font-bold text-xs">{getInitials(t.title)}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-serif font-medium text-sm truncate text-primary">{t.title}</h3>
                    <p className="text-xs text-muted font-mono mt-0.5">Ch. {t.ch}</p>
                    <button 
                      onClick={() => {
                        const link = t.url;
                        if (link) {
                          window.open(link, '_blank', 'noopener,noreferrer');
                        } else {
                          showToast('No URL saved for this title.');
                        }
                      }}
                      className={`mt-2 text-xs font-medium flex items-center gap-1 active:opacity-70 ${
                        t.url ? 'text-link' : 'text-muted'
                      }`}
                    >
                      Read Now <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Link Importer */}
        <div className="bg-card p-4 rounded-xl border border-card shadow-sm mb-6">
          <h2 className="font-serif font-semibold mb-2 text-sm text-secondary">Quick Add / Update</h2>
          <div className="flex gap-2">
            <input 
              type="url" 
              placeholder="Paste chapter link..." 
              className="flex-1 bg-input border border-input rounded-lg px-3 py-3 text-sm text-primary focus:outline-none focus:border-focus placeholder-placeholder"
              value={linkInput}
              onChange={e => setLinkInput(e.target.value)}
              onPaste={handlePasteLink}
            />
            <button className="btn-primary min-w-[44px]" onClick={processLink}>
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
              <input 
                type="text" 
                placeholder="Search library..." 
                className="w-full bg-input border border-input rounded-xl pl-10 pr-4 py-3 text-sm text-primary focus:outline-none focus:border-focus shadow-sm placeholder-placeholder"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select 
              className="bg-input border border-input rounded-xl px-3 py-3 text-sm text-primary focus:outline-none focus:border-focus shadow-sm"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
            >
              <option value="All">All</option>
              <option value="Reading">Reading</option>
              <option value="Planned">Planned</option>
              <option value="Completed">Completed</option>
              <option value="Dropped">Dropped</option>
            </select>
          </div>

          {/* Tag Filter Bar */}
          {allTags.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 hide-scrollbar">
              <button 
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 border transition-colors ${!tagFilter ? 'bg-chip-active text-chip-active border-transparent' : 'bg-chip-default text-chip-default border-chip-default hover:border-input'}`}
                onClick={() => setTagFilter(null)}
              >
                All Tags
              </button>
              {allTags.map(tag => (
                <button 
                  key={tag}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 border transition-colors ${tagFilter === tag ? 'bg-chip-active text-chip-active border-transparent' : 'bg-chip-default text-chip-default border-chip-default hover:border-input'}`}
                  onClick={() => setTagFilter(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Title List */}
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          {filteredTitles.map(t => (
            <div key={t.id} className="bg-card border border-card rounded-xl overflow-hidden shadow-sm flex flex-col relative group transition-colors">
              {/* Cover Image - Top portion */}
              <div className="aspect-[3/4] w-full bg-chapter-btn relative overflow-hidden">
                {t.cover ? (
                  <img src={t.cover} alt={t.title} className="w-full h-full object-cover" onError={(e) => e.currentTarget.style.display = 'none'} referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-chip-active/10 text-link font-serif font-bold text-3xl">
                    {getInitials(t.title)}
                  </div>
                )}
                {t.rating > 0 && (
                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg flex items-center gap-1 border border-white/10">
                    <Star size={12} className="text-yellow-400 fill-yellow-400" />
                    <span className="text-white text-xs font-bold">{t.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>

              {/* Info Section - Bottom portion */}
              <div className="p-3 flex flex-col flex-1 bg-card transition-colors">
                <div className="flex justify-between items-start gap-2 mb-1">
                  <h3 className="font-serif font-semibold text-base leading-tight line-clamp-2 text-primary">{t.title}</h3>
                  {/* Edit Button */}
                  <button onClick={() => setEditingTitle(t)} className="btn-secondary p-1.5 h-8 w-8 flex items-center justify-center flex-shrink-0" aria-label="Edit">
                    <Edit2 size={14} />
                  </button>
                </div>
                
                {/* Status */}
                <div className="flex items-center gap-2 text-xs text-secondary mb-3">
                   <span className={`w-2 h-2 rounded-full ${t.status === 'Reading' ? 'bg-green-500' : t.status === 'Completed' ? 'bg-blue-500' : t.status === 'Planned' ? 'bg-yellow-500' : 'bg-red-500'}`}></span>
                   <span>{t.status}</span>
                </div>

                <div className="mt-auto space-y-3">
                  {/* Stepper */}
                  <div className="flex items-center justify-between bg-chapter-btn border border-input rounded-lg overflow-hidden transition-colors">
                    <button className="px-3 py-2 active:bg-card-hover text-secondary hover:bg-card-hover transition-colors" onClick={() => updateChapter(t.id, -1)}><Minus size={16} /></button>
                    <span className="font-mono text-sm font-medium text-primary">Ch. {t.ch}</span>
                    <button className="px-3 py-2 active:bg-card-hover text-secondary hover:bg-card-hover transition-colors" onClick={() => updateChapter(t.id, 1)}><Plus size={16} /></button>
                  </div>

                  {/* Read Now */}
                  <button 
                    onClick={() => {
                      const link = t.url;
                      if (link) {
                        trackReadingSession(t);
                        window.open(link, '_blank', 'noopener,noreferrer');
                      } else {
                        showToast('No URL saved for this title. Edit the title to add one.');
                      }
                    }}
                    className={`w-full btn-primary ${!t.url ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    Read Now <ExternalLink size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filteredTitles.length === 0 && (
            <div className="col-span-2 text-center py-12 text-muted">
              <ImageIcon size={48} className="mx-auto mb-3 opacity-20" />
              <p className="font-serif">No titles found.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const StatsPage = () => {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weeklyLogs = logs.filter(l => l.timestamp > oneWeekAgo && l.delta > 0);
    const weeklyChapters = weeklyLogs.reduce((sum, l) => sum + l.delta, 0);
    const totalChapters = titles.reduce((sum, t) => sum + t.ch, 0);

    // Reading Session Analytics
    const today = new Date().toDateString();
    const chaptersReadToday = readingSessions.filter(s => new Date(s.created_at).toDateString() === today).length;
    
    const oneWeekAgoDate = new Date();
    oneWeekAgoDate.setDate(oneWeekAgoDate.getDate() - 7);
    const chaptersReadThisWeek = readingSessions.filter(s => new Date(s.created_at) > oneWeekAgoDate).length;

    const seriesReadCounts = readingSessions.reduce((acc, s) => {
      acc[s.title_id] = (acc[s.title_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const mostReadSeriesId = Object.keys(seriesReadCounts).reduce((a, b) => seriesReadCounts[a] > seriesReadCounts[b] ? a : b, '');
    const mostReadSeries = titles.find(t => t.id === mostReadSeriesId)?.title || 'N/A';

    // Calculate average chapters per day (simple average over all days with activity)
    const uniqueDays = new Set(readingSessions.map(s => new Date(s.created_at).toDateString())).size;
    const avgChaptersPerDay = uniqueDays > 0 ? (readingSessions.length / uniqueDays).toFixed(1) : '0';

    // Calculate streak
    const sortedDates = Array.from(new Set(readingSessions.map(s => new Date(s.created_at).toDateString())))
      .map((d: string) => new Date(d).getTime())
      .sort((a, b) => b - a);
    
    let streak = 0;
    let currentDate = new Date().setHours(0,0,0,0);
    // Check if read today
    if (sortedDates.length > 0 && sortedDates[0] >= currentDate) {
      streak = 1;
      currentDate -= 86400000; // Move to yesterday
    }
    
    for (const date of sortedDates) {
       if (date === currentDate) { // If matches yesterday (or previous day in loop)
         streak++;
         currentDate -= 86400000;
       } else if (date > currentDate) {
         // Already counted (today)
         continue;
       } else {
         break;
       }
    }


    const stats = {
      reading: titles.filter(t => t.status === 'Reading').length,
      completed: titles.filter(t => t.status === 'Completed').length,
      planned: titles.filter(t => t.status === 'Planned').length,
      dropped: titles.filter(t => t.status === 'Dropped').length,
      total: titles.length
    };

    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <h1 className="font-serif font-bold text-2xl mb-6 text-primary">Statistics</h1>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-card p-4 rounded-xl border border-card shadow-sm transition-colors">
            <div className="text-xs text-muted uppercase font-semibold mb-1">Weekly Chapters</div>
            <div className="text-3xl font-mono text-link">{weeklyChapters}</div>
          </div>
          <div className="bg-card p-4 rounded-xl border border-card shadow-sm transition-colors">
            <div className="text-xs text-muted uppercase font-semibold mb-1">Total Chapters</div>
            <div className="text-3xl font-mono text-secondary">{totalChapters}</div>
          </div>
          <div className="bg-card p-4 rounded-xl border border-card shadow-sm transition-colors">
            <div className="text-xs text-muted uppercase font-semibold mb-1">Read Today</div>
            <div className="text-3xl font-mono text-green-500">{chaptersReadToday}</div>
          </div>
          <div className="bg-card p-4 rounded-xl border border-card shadow-sm transition-colors">
            <div className="text-xs text-muted uppercase font-semibold mb-1">Current Streak</div>
            <div className="text-3xl font-mono text-orange-500">{streak} days</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
           <div className="bg-card p-4 rounded-xl border border-card shadow-sm transition-colors">
            <div className="text-xs text-muted uppercase font-semibold mb-1">Most Read Series</div>
            <div className="text-xl font-serif font-medium truncate text-primary" title={mostReadSeries}>{mostReadSeries}</div>
          </div>
          <div className="bg-card p-4 rounded-xl border border-card shadow-sm transition-colors">
            <div className="text-xs text-muted uppercase font-semibold mb-1">Avg. Chapters / Day</div>
            <div className="text-xl font-mono font-medium text-primary">{avgChaptersPerDay}</div>
          </div>
        </div>

        <div className="bg-card p-4 rounded-xl border border-card shadow-sm transition-colors">
          <h2 className="font-serif font-semibold mb-4 text-lg text-primary">Library Status</h2>
          <div className="space-y-4">
            {[
              { label: 'Reading', count: stats.reading, color: 'bg-green-500' },
              { label: 'Completed', count: stats.completed, color: 'bg-blue-500' },
              { label: 'Planned', count: stats.planned, color: 'bg-yellow-500' },
              { label: 'Dropped', count: stats.dropped, color: 'bg-red-500' },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-primary">{item.label}</span>
                  <span className="font-mono text-muted">{item.count}</span>
                </div>
                <div className="h-2 bg-chapter-btn rounded-full overflow-hidden transition-colors">
                  <div className={`h-full ${item.color}`} style={{ width: `${stats.total ? (item.count / stats.total) * 100 : 0}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const LogPage = () => {
    const groupedLogs = useMemo(() => {
      return logs.reduce((acc, log) => {
        const date = new Date(log.timestamp).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        if (!acc[date]) acc[date] = [];
        acc[date].push(log);
        return acc;
      }, {} as Record<string, LogEntry[]>);
    }, [logs]);

    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <h1 className="font-serif font-bold text-2xl mb-6 text-primary">Reading Log</h1>
        
        {Object.keys(groupedLogs).length === 0 ? (
          <div className="text-center py-12 text-muted">
            <p className="font-serif">No reading history yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedLogs).map(([date, dayLogs]: [string, any]) => (
              <div key={date}>
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 pl-1">{date}</h3>
                <div className="bg-card border border-card rounded-xl shadow-sm overflow-hidden transition-colors">
                  {dayLogs.map((log, idx) => (
                    <div key={log.id} className={`p-3 flex items-center justify-between ${idx !== dayLogs.length - 1 ? 'border-b border-card' : ''}`}>
                      <div className="min-w-0 flex-1 pr-4">
                        <div className="font-medium text-sm truncate text-primary">{log.title}</div>
                        <div className="text-xs text-muted mt-0.5">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-sm flex-shrink-0">
                        <span className="text-muted">{log.from}</span>
                        <ArrowRight size={12} className="text-muted" />
                        <span className="font-semibold text-link">{log.to}</span>
                        <span className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded ml-1 border border-green-500/20">+{log.delta}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const SitesPage = () => {
    const [siteName, setSiteName] = useState('');
    const [siteUrl, setSiteUrl] = useState('');

    const addSite = async () => {
      if (siteName && siteUrl) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase.from('sites').insert({ name: siteName, url: siteUrl, user_id: user.id }).select();
        if (data) {
          setSites(prev => [...prev, data[0] as Site]);
          setSiteName('');
          setSiteUrl('');
        }
      }
    };

    const removeSite = async (id: string) => {
      const { error } = await supabase.from('sites').delete().eq('id', id);
      if (!error) {
        setSites(prev => prev.filter(s => s.id !== id));
      }
    };

    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <h1 className="font-serif font-bold text-2xl mb-6 text-primary">Saved Sites</h1>

        <div className="bg-card p-4 rounded-xl border border-card shadow-sm mb-6 transition-colors">
          <h2 className="font-serif font-semibold mb-3 text-sm text-secondary">Add New Site</h2>
          <div className="flex flex-col gap-3">
            <input type="text" placeholder="Site Name (e.g., Asura Scans)" className="bg-input border border-input rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:border-focus placeholder-placeholder transition-colors" value={siteName} onChange={e => setSiteName(e.target.value)} />
            <input type="url" placeholder="URL (e.g., https://asurascans.com)" className="bg-input border border-input rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:border-focus placeholder-placeholder transition-colors" value={siteUrl} onChange={e => setSiteUrl(e.target.value)} />
            <button onClick={addSite} className="btn-primary px-4 py-2 text-sm">Add Site</button>
          </div>
        </div>

        <div className="space-y-3">
          {sites.map(site => (
            <div key={site.id} className="bg-card border border-card rounded-xl p-3 flex justify-between items-center shadow-sm transition-colors">
              <div className="min-w-0 pr-4">
                <div className="font-medium text-sm truncate text-primary">{site.name}</div>
                <a href={site.url} target="_blank" rel="noreferrer" className="text-xs text-link truncate block hover:underline">{site.url}</a>
              </div>
              <button onClick={() => removeSite(site.id)} className="btn-ghost text-red-500 hover:text-red-600 hover:bg-red-500/10 flex-shrink-0"><Trash2 size={18} /></button>
            </div>
          ))}
          {sites.length === 0 && <p className="text-center text-muted text-sm py-4">No sites saved.</p>}
        </div>
      </div>
    );
  };

  const RecommendationsPage = () => {
    const [loading, setLoading] = useState(false);

    const fetchRecommendations = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('recommendations')
          .select('*')
          .eq('user_id', user.id)
          .order('score', { ascending: false });
        
        console.log('Raw recommendations data:', data);

        if (error) throw error;
        
        if (data) setRecommendations(data as Recommendation[]);
      } catch (e: any) {
        console.error('Recommendation Fetch Error:', e);
        showToast('Failed to fetch recommendations.');
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      fetchRecommendations();
    }, []);

    const generateRecs = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showToast('You must be logged in to generate recommendations.');
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('generate-recommendations', {
          body: { user_id: user.id }
        });
        
        if (error) throw new Error(error.message || 'Function invocation failed');
        
        await fetchRecommendations();
        showToast('Recommendations generated!');
      } catch (e: any) {
        console.error('Recommendation Error:', e);
        showToast(`Failed to generate recommendations: ${e.message || 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    const groupedRecs = useMemo(() => {
      const groups: Record<string, Recommendation[]> = {};
      recommendations.forEach(rec => {
        const sec = rec.section || 'personalized';
        if (!groups[sec]) groups[sec] = [];
        groups[sec].push(rec);
      });
      return groups;
    }, [recommendations]);

    const isPersonalizedFallback = Object.keys(groupedRecs).length === 1 && groupedRecs['personalized'];

    const sections = [
      { id: 'hot_this_week', title: '🔥 Hot This Week', subtitle: 'Most trending Korean manhwa on AniList this week', type: 'row' },
      { id: 'tier_10', title: '💎 Masterpiece Picks', subtitle: 'Based on your 10★ titles', type: 'grid' },
      { id: 'tier_9', title: '⭐ Excellent Picks', subtitle: 'Based on your 9★ titles', type: 'grid' },
      { id: 'tier_8', title: '✨ Great Picks', subtitle: 'Based on your 8★ titles', type: 'grid' },
      { id: 'tier_7', title: '👍 Good Picks', subtitle: 'Based on your 7★ titles', type: 'grid' },
    ];

    const [addedRecs, setAddedRecs] = useState<Set<string>>(new Set());

    const handleQuickAdd = async (rec: Recommendation) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showToast('You must be logged in to add titles.');
        return;
      }

      if (titles.some(t => t.title.toLowerCase() === rec.title.toLowerCase())) {
        showToast('Already in Library');
        return;
      }

      const newTitle: Title = {
       
        user_id: user.id,
        title: rec.title,
        cover: rec.cover,
        url: rec.site_url || '',
        site: 'AniList',
        tags: rec.tags || [],
        type: 'Manhwa',
        status: 'Planned',
        ch: 0,
        total: 0,
        rating: 0,
        fav: false,
        note: '',
        updated: Date.now()
      };

      const { data, error } = await supabase.from('titles').insert(newTitle).select();
      
      if (error) {
        console.error('Error adding title:', error);
        showToast('Failed to add title');
      } else if (data) {
        setTitles(prev => [data[0] as Title, ...prev]);
        setAddedRecs(prev => new Set(prev).add(rec.id));
        showToast('Added to Library!');
      }
    };

    const getButtonState = (rec: Recommendation) => {
      if (addedRecs.has(rec.id)) return { text: 'Added ✓', disabled: true, className: 'bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/10' };
      if (titles.some(t => t.title.toLowerCase() === rec.title.toLowerCase())) return { text: 'Already in Library', disabled: true, className: 'opacity-50 cursor-not-allowed' };
      return { text: 'Add to Library', disabled: false, className: 'btn-secondary' };
    };

    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-8 pb-20">
        <div className="flex justify-between items-center mb-6">
          <h1 className="font-serif font-bold text-2xl text-primary">Recommendations</h1>
          <button 
            onClick={generateRecs} 
            disabled={loading}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
          >
            <Sparkles size={16} className="mr-2" />
            {loading ? 'Generating...' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-link border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-muted">Analyzing your library...</p>
          </div>
        ) : recommendations.length === 0 ? (
          <div className="text-center py-12 text-muted">
            <p className="font-serif">No recommendations yet. Rate some titles 7+ to get started!</p>
          </div>
        ) : isPersonalizedFallback ? (
          <section className="space-y-4">
            <h2 className="font-serif font-bold text-xl text-primary">For You</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recommendations.map(rec => {
                const btnState = getButtonState(rec);
                return (
                  <div key={rec.id} className="bg-card border border-card rounded-xl p-3 flex gap-3 shadow-sm transition-colors">
                     <div className="w-20 h-28 flex-shrink-0 rounded-lg overflow-hidden bg-chapter-btn relative">
                        {rec.cover ? (
                          <img src={rec.cover} alt={rec.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted font-serif text-xl font-bold bg-chapter-btn">
                            {getInitials(rec.title)}
                          </div>
                        )}
                     </div>
                     <div className="flex-1 min-w-0 flex flex-col">
                       <h3 className="font-serif font-bold text-primary truncate mb-1">{rec.title}</h3>
                       <div className="flex flex-wrap gap-1 mb-auto">
                          {rec.tags?.slice(0, 3).map(tag => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-chip-default text-chip-default rounded-sm border border-chip-default transition-colors">{tag}</span>
                          ))}
                       </div>
                       <button 
                         onClick={() => handleQuickAdd(rec)} 
                         disabled={btnState.disabled}
                         className={`w-full text-xs mt-2 py-1.5 justify-center rounded-lg border transition-colors ${btnState.className === 'btn-secondary' ? 'btn-secondary' : btnState.className}`}
                       >
                         {btnState.text}
                       </button>
                     </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <>
            {sections.map(section => {
              const recs = groupedRecs[section.id];
              if (!recs || recs.length === 0) return null;

              return (
                <section key={section.id} className="space-y-4">
                  <div>
                    <h2 className="font-serif font-bold text-xl text-primary">{section.title}</h2>
                    {section.subtitle && <p className="text-sm text-muted">{section.subtitle}</p>}
                  </div>
                  
                  {section.type === 'row' ? (
                    <div className="flex overflow-x-auto gap-4 pb-4 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide snap-x">
                      {recs.map(rec => {
                        const btnState = getButtonState(rec);
                        return (
                          <div key={rec.id} className="min-w-[160px] w-[160px] bg-card border border-card rounded-xl p-3 shadow-sm flex flex-col transition-colors snap-start">
                             <div className="w-full aspect-[2/3] rounded-lg overflow-hidden bg-chapter-btn mb-3 relative">
                                {rec.cover ? (
                                  <img src={rec.cover} alt={rec.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-muted font-serif text-xl font-bold bg-chapter-btn">
                                    {getInitials(rec.title)}
                                  </div>
                                )}
                             </div>
                             <h3 className="font-serif font-bold text-sm text-primary line-clamp-2 mb-1">{rec.title}</h3>
                             <p className="text-[10px] text-orange-500 font-medium mb-2">🔥 Trending this week</p>
                             <div className="flex flex-wrap gap-1 mb-3">
                                {rec.tags?.slice(0, 2).map(tag => (
                                  <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-chip-default text-chip-default rounded-sm border border-chip-default transition-colors">{tag}</span>
                                ))}
                             </div>
                             <button 
                               onClick={() => handleQuickAdd(rec)} 
                               disabled={btnState.disabled}
                               className={`mt-auto w-full text-xs py-1.5 justify-center rounded-lg border transition-colors ${btnState.className === 'btn-secondary' ? 'btn-secondary' : btnState.className}`}
                             >
                               {btnState.text}
                             </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {recs.map(rec => {
                        const btnState = getButtonState(rec);
                        return (
                          <div key={rec.id} className="bg-card border border-card rounded-xl p-3 flex gap-3 shadow-sm transition-colors">
                             <div className="w-20 h-28 flex-shrink-0 rounded-lg overflow-hidden bg-chapter-btn relative">
                                {rec.cover ? (
                                  <img src={rec.cover} alt={rec.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-muted font-serif text-xl font-bold bg-chapter-btn">
                                    {getInitials(rec.title)}
                                  </div>
                                )}
                             </div>
                             <div className="flex-1 min-w-0 flex flex-col">
                               <h3 className="font-serif font-bold text-primary truncate mb-1">{rec.title}</h3>
                               <p className="text-xs text-muted line-clamp-1 mb-2">Because you liked: <span className="font-medium text-link">{rec.source_title}</span></p>
                               <div className="flex flex-wrap gap-1 mb-auto">
                                  {rec.tags?.slice(0, 3).map(tag => (
                                    <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-chip-default text-chip-default rounded-sm border border-chip-default transition-colors">{tag}</span>
                                  ))}
                               </div>
                               <button 
                                 onClick={() => handleQuickAdd(rec)} 
                                 disabled={btnState.disabled}
                                 className={`w-full text-xs mt-2 py-1.5 justify-center rounded-lg border transition-colors ${btnState.className === 'btn-secondary' ? 'btn-secondary' : btnState.className}`}
                               >
                                 {btnState.text}
                               </button>
                             </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </>
        )}
      </div>
    );
  };
  const ImportExportPage = () => {
    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      // Reset the input value so the same file can be selected again if needed
      e.target.value = '';

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            showToast('You must be logged in to import data.');
            return;
          }

          const fileContent = event.target?.result as string;
          let data;
          try {
            data = JSON.parse(fileContent);
          } catch (parseError) {
            console.error("JSON Parse Error:", parseError);
            showToast("Invalid JSON file format.");
            return;
          }

          // Handle different export formats
          let importedTitles: any[] = [];
          if (Array.isArray(data)) {
            importedTitles = data;
          } else if (data.titles && Array.isArray(data.titles)) {
            importedTitles = data.titles;
          } else if (data.library && Array.isArray(data.library)) {
             importedTitles = data.library;
          } else {
             // Try to find any array property that looks like a list of titles
             const possibleArray = Object.values(data).find(val => Array.isArray(val) && val.length > 0 && (val[0].title || val[0].name));
             if (possibleArray) {
               importedTitles = possibleArray as any[];
             }
          }

          if (importedTitles.length === 0) {
            showToast("No titles found in the imported file.");
            return;
          }
          
          const toInsert: any[] = [];
          
          importedTitles.forEach((item: any) => {
            const titleStr = item.title || item.name || item.seriesTitle || '';
            if (!titleStr) return;

            // Check duplicate in current state
            const exists = titles.find(t => t.title.toLowerCase() === titleStr.toLowerCase());
            
            // Also check if we already added it to the insert queue (handle duplicates in the file itself)
            const alreadyInQueue = toInsert.find(t => t.title.toLowerCase() === titleStr.toLowerCase());

            if (!exists && !alreadyInQueue) {
               toInsert.push({
                 user_id: user.id,
                 title: titleStr,
                 type: item.type || 'Manhwa',
                 status: item.status || 'Reading',
                 ch: parseInt(item.ch || item.chapter || item.currentChapter || '0', 10) || 0,
                 total: parseInt(item.total || item.totalChapters || '0', 10) || 0,
                 cover: item.cover || item.image || item.coverUrl || item.imageUrl || item.thumbnail || item.thumb || item.picture || '',
                 url: item.url || item.link || item.siteUrl || item.source || item.href || item.readUrl || item.lastReadUrl || '',
                 site: item.site || '',
                 rating: parseInt(item.rating || item.score || '0', 10) || 0,
                 tags: Array.isArray(item.tags) ? item.tags : (typeof item.tags === 'string' ? item.tags.split(',').map((t: string) => t.trim()) : []),
                 fav: !!(item.fav || item.favorite || item.isFavorite),
                 note: item.note || item.comments || '',
                 updated: item.updated || Date.now()
               });
            }
          });

          if (toInsert.length > 0) {
            const { data, error } = await supabase.from('titles').insert(toInsert).select();
            if (error) throw error;
            if (data) {
              setTitles(prev => [...data as Title[], ...prev]);
              showToast(`Successfully imported ${data.length} new titles.`);
            }
          } else {
            showToast('No new titles found to import (duplicates skipped).');
          }
        } catch (err) {
          console.error("Import Error:", err);
          showToast("Failed to import titles. Check console for details.");
        }
      };
      reader.readAsText(file);
    };

    const handleExport = () => {
      const dataStr = JSON.stringify(titles, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'manhwavault.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    const handleClearData = () => {
      setConfirmDialog({
        title: 'Clear All Data',
        message: 'WARNING: This will permanently delete ALL your titles, reading logs, and saved sites from the database. This action cannot be undone. Are you absolutely sure?',
        onConfirm: async () => {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { error: tErr } = await supabase.from('titles').delete().eq('user_id', user.id);
          const { error: lErr } = await supabase.from('logs').delete().eq('user_id', user.id);
          const { error: sErr } = await supabase.from('sites').delete().eq('user_id', user.id);
          
          if (!tErr && !lErr && !sErr) {
            setTitles([]);
            setLogs([]);
            setSites([]);
            showToast('All data has been cleared from database.');
          } else {
            showToast('Failed to clear some data.');
          }
        }
      });
    };

    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <h1 className="font-serif font-bold text-2xl mb-6 text-primary">Data Management</h1>

        <div className="grid gap-4 md:grid-cols-2 mb-6">
          <div className="bg-card p-5 rounded-xl border border-card shadow-sm flex flex-col items-center text-center transition-colors">
            <div className="w-12 h-12 bg-blue-500/10 text-blue-500 rounded-full flex items-center justify-center mb-3 border border-blue-500/20">
              <Download size={24} />
            </div>
            <h2 className="font-serif font-semibold mb-1 text-primary">Export Library</h2>
            <p className="text-sm text-muted mb-4">Download your entire library as a JSON file for backup.</p>
            <button onClick={handleExport} className="w-full btn-secondary px-4 py-2 text-sm">
              Download JSON
            </button>
          </div>

          <div className="bg-card p-5 rounded-xl border border-card shadow-sm flex flex-col items-center text-center transition-colors">
            <div className="w-12 h-12 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mb-3 border border-green-500/20">
              <Upload size={24} />
            </div>
            <h2 className="font-serif font-semibold mb-1 text-primary">Import Library</h2>
            <p className="text-sm text-muted mb-4">Upload a JSON file from another tracker or backup.</p>
            <div className="relative w-full">
              <input type="file" accept=".json" onChange={handleImport} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <button className="w-full btn-primary px-4 py-2 text-sm pointer-events-none">
                Select JSON File
              </button>
            </div>
          </div>
        </div>

        <div className="bg-red-500/5 p-5 rounded-xl border border-red-500/10 shadow-sm flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-3 border border-red-500/20">
            <Trash2 size={24} />
          </div>
          <h2 className="font-serif font-semibold mb-1 text-red-600 dark:text-red-400">Danger Zone</h2>
          <p className="text-sm text-red-600/70 dark:text-red-400/70 mb-4">Permanently delete all titles, reading history, and saved sites. This cannot be undone.</p>
          <button onClick={handleClearData} className="w-full bg-transparent border border-red-500/30 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg font-medium text-sm hover:bg-red-500/10 transition-colors">
            Clear All Data
          </button>
        </div>
      </div>
    );
  };

  // --- Render ---
  return (
    <div className="flex flex-col h-screen bg-page text-primary font-sans transition-colors">
      
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex flex-col w-64 fixed h-full bg-sidebar border-r border-divider z-40 transition-colors">
        <div className="p-6">
          <h1 className="font-serif font-bold text-2xl text-link tracking-tight">ManhwaVault</h1>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          {[
            { id: 'home', icon: Home, label: 'Library' },
            { id: 'stats', icon: BarChart2, label: 'Statistics' },
            { id: 'recommendations', icon: Sparkles, label: 'For You' },
            { id: 'log', icon: ListIcon, label: 'Reading Log' },
            { id: 'sites', icon: Globe, label: 'Saved Sites' },
            { id: 'import', icon: Download, label: 'Data' },
          ].map(item => (
            <button 
              key={item.id}
              onClick={() => setCurrentTab(item.id as any)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${currentTab === item.id ? 'bg-chip-active/10 text-link' : 'text-secondary hover:bg-card-hover hover:text-primary'}`}
            >
              <item.icon size={18} /> {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden md:pl-64 relative">
        {/* Unified Header */}
        <Header />

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
            {currentTab === 'home' && <HomePage />}
            {currentTab === 'stats' && <StatsPage />}
            {currentTab === 'recommendations' && <RecommendationsPage />}
            {currentTab === 'log' && <LogPage />}
            {currentTab === 'sites' && <SitesPage />}
            {currentTab === 'import' && <ImportExportPage />}
        </div>
      </main>

      {/* Bottom Nav (Mobile) */}
      <nav className="md:hidden fixed bottom-0 w-full bg-bottomnav border-t border-divider flex justify-around items-center h-16 z-40 pb-safe transition-colors">
        {[
          { id: 'home', icon: Home, label: 'Home' },
          { id: 'stats', icon: BarChart2, label: 'Stats' },
          { id: 'recommendations', icon: Sparkles, label: 'For You' },
          { id: 'log', icon: ListIcon, label: 'Log' },
          { id: 'sites', icon: Globe, label: 'Sites' },
          { id: 'import', icon: Download, label: 'Data' },
        ].map(item => (
          <button 
            key={item.id}
            onClick={() => setCurrentTab(item.id as any)}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${currentTab === item.id ? 'text-link' : 'text-secondary'}`}
          >
            <item.icon size={20} strokeWidth={currentTab === item.id ? 2.5 : 2} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      <TitleEditorModal />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-card text-primary px-6 py-3 rounded-full shadow-xl z-50 flex items-center gap-2 animate-in fade-in slide-in-from-top-4 border border-card">
          <Check size={18} className="text-green-500" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-modal rounded-2xl w-full max-w-sm shadow-xl p-6 flex flex-col gap-4 border border-card">
            <h2 className="font-serif font-bold text-xl text-primary">{confirmDialog.title}</h2>
            <p className="text-secondary text-sm">{confirmDialog.message}</p>
            <div className="flex gap-3 mt-2">
              <button 
                onClick={() => setConfirmDialog(null)} 
                className="flex-1 btn-secondary"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }} 
                className="flex-1 px-4 py-2.5 rounded-xl font-medium text-sm bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 active:bg-red-500/30"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

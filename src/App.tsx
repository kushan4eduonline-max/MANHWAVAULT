import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Home, BarChart2, List as ListIcon, Globe, Download, Plus, Minus, ExternalLink, Search, X, Image as ImageIcon, Upload, Edit2, Trash2, Check, ArrowRight, Bookmark, Filter } from 'lucide-react';
import { supabase } from './services/supabaseClient';
import { Auth } from './components/Auth';

// --- Types ---
export type TitleStatus = 'Reading' | 'Completed' | 'Planned' | 'Dropped';

export interface Title {
  id: string;
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

// --- Hooks ---
function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue];
}

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
  if (!session) return <Auth onAuthSuccess={() => {}} />;

  return <MainApp />;
}

function MainApp() {
  const [titles, setTitles] = useState<Title[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  
  const [currentTab, setCurrentTab] = useState<'home' | 'stats' | 'log' | 'sites' | 'import'>('home');
  const [editingTitle, setEditingTitle] = useState<Partial<Title> | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string, message: string, onConfirm: () => void } | null>(null);
  
  useEffect(() => {
    const fetchData = async () => {
      const { data: titlesData } = await supabase.from('titles').select('*');
      const { data: logsData } = await supabase.from('logs').select('*');
      const { data: sitesData } = await supabase.from('sites').select('*');
      if (titlesData) setTitles(titlesData as Title[]);
      if (logsData) setLogs(logsData as LogEntry[]);
      if (sitesData) setSites(sitesData as Site[]);
    };
    fetchData();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  };

  // --- Actions ---
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

  const saveTitle = (titleData: Partial<Title>) => {
    if (titleData.id) {
      // Update
      setTitles(prev => prev.map(t => t.id === titleData.id ? { ...t, ...titleData, updated: Date.now() } as Title : t));
    } else {
      // Create
      const newTitle: Title = {
        id: generateId(),
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
      setTitles(prev => [newTitle, ...prev]);
    }
    setEditingTitle(null);
  };

  const deleteTitle = (id: string) => {
    setConfirmDialog({
      title: 'Delete Title',
      message: 'Are you sure you want to delete this title? This action cannot be undone.',
      onConfirm: () => {
        setTitles(prev => prev.filter(t => t.id !== id));
        setEditingTitle(null);
        showToast('Title deleted.');
      }
    });
  };

  // --- Sub-components ---

  const TitleEditorModal = () => {
    if (!editingTitle) return null;

    const [formData, setFormData] = useState<Partial<Title>>({
      title: '', type: 'Manhwa', status: 'Reading', ch: 0, total: 0, cover: '', url: '', site: '', tags: [], ...editingTitle
    });
    const [tagInput, setTagInput] = useState('');

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
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onPaste={handlePaste}>
        <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl flex flex-col">
          <div className="sticky top-0 bg-white border-b border-gray-100 p-4 flex justify-between items-center z-10">
            <h2 className="font-serif font-semibold text-lg">{formData.id ? 'Edit Title' : 'Add Title'}</h2>
            <button onClick={() => setEditingTitle(null)} className="p-2 -mr-2 text-gray-400 active:text-gray-600"><X size={20} /></button>
          </div>
          
          <div className="p-4 flex flex-col gap-4">
            {/* Cover Image Section */}
            <div className="flex gap-4 items-start">
              <div className="w-24 h-32 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200 relative flex items-center justify-center">
                {formData.cover ? (
                  <img src={formData.cover} alt="Cover" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <ImageIcon className="text-gray-300" size={32} />
                )}
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-500 uppercase">Cover Image</label>
                <input 
                  type="text" 
                  placeholder="Image URL or paste image" 
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-mv-primary"
                  value={formData.cover || ''}
                  onChange={e => setFormData(prev => ({ ...prev, cover: e.target.value }))}
                />
                <div className="relative">
                  <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileUpload} />
                  <button className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-600 px-3 py-2 rounded-lg text-sm font-medium active:bg-gray-200">
                    <Upload size={16} /> Upload File
                  </button>
                </div>
              </div>
            </div>

            {/* Basic Info */}
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Title</label>
                <input type="text" className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-mv-primary" value={formData.title || ''} onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))} />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Chapter</label>
                  <input type="number" className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-mv-primary" value={formData.ch || 0} onChange={e => setFormData(prev => ({ ...prev, ch: parseInt(e.target.value) || 0 }))} />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Status</label>
                  <select className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-mv-primary" value={formData.status} onChange={e => setFormData(prev => ({ ...prev, status: e.target.value as TitleStatus }))}>
                    <option value="Reading">Reading</option>
                    <option value="Planned">Planned</option>
                    <option value="Completed">Completed</option>
                    <option value="Dropped">Dropped</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Series URL</label>
                  <input type="url" className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-mv-primary" value={formData.url || ''} onChange={e => setFormData(prev => ({ ...prev, url: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Site Name</label>
                  <input type="text" className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-mv-primary" value={formData.site || ''} onChange={e => setFormData(prev => ({ ...prev, site: e.target.value }))} />
                </div>
              </div>
              
              {/* Tags */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Tags</label>
                <div className="flex gap-2 mb-2">
                  <input 
                    type="text" 
                    placeholder="Add tag..." 
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-mv-primary"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  />
                  <button onClick={addTag} className="bg-gray-100 px-3 py-2 rounded-lg text-sm font-medium active:bg-gray-200">Add</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {formData.tags?.map(tag => (
                    <span key={tag} className="flex items-center gap-1 bg-mv-primary/10 text-mv-primary px-2 py-1 rounded-md text-xs font-medium">
                      {tag} <button onClick={() => removeTag(tag)} className="opacity-50 hover:opacity-100"><X size={12} /></button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 flex justify-between items-center z-10">
            {formData.id ? (
              <button onClick={() => deleteTitle(formData.id!)} className="p-2 text-red-500 active:bg-red-50 rounded-lg"><Trash2 size={20} /></button>
            ) : <div></div>}
            <button onClick={() => saveTitle(formData)} className="bg-mv-primary text-white px-6 py-2.5 rounded-xl font-medium shadow-sm active:bg-mv-primary/90 flex items-center gap-2">
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
            <h2 className="font-serif font-semibold text-lg mb-3 flex items-center gap-2"><Bookmark size={18} className="text-mv-secondary" /> Quick Resume</h2>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x">
              {quickResumeTitles.map(t => (
                <div key={`qr-${t.id}`} className="bg-white border border-black/10 rounded-xl p-3 flex-shrink-0 w-64 snap-start shadow-sm flex items-center gap-3">
                  <div className="w-12 h-16 bg-gray-100 rounded flex-shrink-0 overflow-hidden relative flex items-center justify-center">
                    {t.cover ? <img src={t.cover} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" /> : <span className="text-mv-primary font-serif font-bold text-xs">{getInitials(t.title)}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-serif font-medium text-sm truncate">{t.title}</h3>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">Ch. {t.ch}</p>
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
                        t.url ? 'text-mv-primary' : 'text-gray-400'
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
        <div className="bg-white p-4 rounded-xl border border-black/10 shadow-sm mb-6">
          <h2 className="font-serif font-semibold mb-2 text-sm text-gray-700">Quick Add / Update</h2>
          <div className="flex gap-2">
            <input 
              type="url" 
              placeholder="Paste chapter link..." 
              className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-mv-primary"
              value={linkInput}
              onChange={e => setLinkInput(e.target.value)}
              onPaste={handlePasteLink}
            />
            <button className="bg-mv-primary text-white px-4 py-3 rounded-lg font-medium text-sm active:bg-mv-primary/90 flex items-center justify-center min-w-[44px]" onClick={processLink}>
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Search library..." 
                className="w-full bg-white border border-black/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-mv-primary shadow-sm"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select 
              className="bg-white border border-black/10 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-mv-primary shadow-sm"
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
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 border ${!tagFilter ? 'bg-mv-primary text-white border-mv-primary' : 'bg-white text-gray-600 border-gray-200'}`}
                onClick={() => setTagFilter(null)}
              >
                All Tags
              </button>
              {allTags.map(tag => (
                <button 
                  key={tag}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 border ${tagFilter === tag ? 'bg-mv-primary text-white border-mv-primary' : 'bg-white text-gray-600 border-gray-200'}`}
                  onClick={() => setTagFilter(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Title List */}
        <div className="flex flex-col gap-3">
          {filteredTitles.map(t => (
            <div key={t.id} className="bg-white border border-black/10 rounded-xl p-3 flex gap-3 shadow-sm relative group">
              {/* Edit Button overlay (desktop) or absolute (mobile) */}
              <button onClick={() => setEditingTitle(t)} className="absolute top-2 right-2 p-2 bg-white/80 backdrop-blur rounded-lg text-gray-500 active:text-mv-primary shadow-sm z-10">
                <Edit2 size={14} />
              </button>

              {/* Cover */}
              <div className="w-20 h-28 flex-shrink-0 rounded-md overflow-hidden bg-gray-100 flex items-center justify-center relative">
                {t.cover ? (
                  <img src={t.cover} alt={t.title} className="w-full h-full object-cover" onError={(e) => e.currentTarget.style.display = 'none'} referrerPolicy="no-referrer" />
                ) : null}
                <div className="absolute inset-0 flex items-center justify-center bg-mv-primary/10 text-mv-primary font-serif font-bold text-xl -z-10">
                  {getInitials(t.title)}
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 flex flex-col min-w-0 pr-8">
                <h3 className="font-serif font-semibold text-base leading-tight truncate">{t.title}</h3>
                <div className="text-xs text-gray-500 mt-1 truncate flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${t.status === 'Reading' ? 'bg-green-500' : t.status === 'Completed' ? 'bg-blue-500' : t.status === 'Planned' ? 'bg-yellow-500' : 'bg-red-500'}`}></span>
                  {t.status} {t.site && `• ${t.site}`}
                </div>
                
                {/* Tags */}
                {t.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {t.tags.slice(0,3).map(tag => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-sm truncate max-w-[80px]">{tag}</span>
                    ))}
                    {t.tags.length > 3 && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-sm">+{t.tags.length - 3}</span>}
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between pt-2">
                  {/* Stepper */}
                  <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                    <button className="px-3 py-2 active:bg-gray-200 text-gray-600" onClick={() => updateChapter(t.id, -1)}><Minus size={16} /></button>
                    <span className="font-mono text-sm px-2 min-w-[4ch] text-center font-medium">{t.ch}</span>
                    <button className="px-3 py-2 active:bg-gray-200 text-gray-600" onClick={() => updateChapter(t.id, 1)}><Plus size={16} /></button>
                  </div>

                  {/* Continue Reading */}
                  <button 
                    onClick={() => {
                      const link = t.url;
                      if (link) {
                        window.open(link, '_blank', 'noopener,noreferrer');
                      } else {
                        showToast('No URL saved for this title. Edit the title to add one.');
                      }
                    }}
                    className={`px-4 py-2 text-sm font-medium rounded-lg ml-2 flex items-center gap-1.5 shadow-sm transition-colors ${
                      t.url 
                        ? 'text-white bg-mv-primary active:bg-mv-primary/90' 
                        : 'text-gray-400 bg-gray-100'
                    }`}
                  >
                    Read Now <ExternalLink size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filteredTitles.length === 0 && (
            <div className="text-center py-12 text-gray-400">
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

    const stats = {
      reading: titles.filter(t => t.status === 'Reading').length,
      completed: titles.filter(t => t.status === 'Completed').length,
      planned: titles.filter(t => t.status === 'Planned').length,
      dropped: titles.filter(t => t.status === 'Dropped').length,
      total: titles.length
    };

    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <h1 className="font-serif font-bold text-2xl mb-6">Statistics</h1>
        
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white p-4 rounded-xl border border-black/10 shadow-sm">
            <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Weekly Chapters</div>
            <div className="text-3xl font-mono text-mv-primary">{weeklyChapters}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-black/10 shadow-sm">
            <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Total Chapters</div>
            <div className="text-3xl font-mono text-mv-secondary">{totalChapters}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-black/10 shadow-sm">
          <h2 className="font-serif font-semibold mb-4 text-lg">Library Status</h2>
          <div className="space-y-4">
            {[
              { label: 'Reading', count: stats.reading, color: 'bg-green-500' },
              { label: 'Completed', count: stats.completed, color: 'bg-blue-500' },
              { label: 'Planned', count: stats.planned, color: 'bg-yellow-500' },
              { label: 'Dropped', count: stats.dropped, color: 'bg-red-500' },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700">{item.label}</span>
                  <span className="font-mono text-gray-500">{item.count}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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
        <h1 className="font-serif font-bold text-2xl mb-6">Reading Log</h1>
        
        {Object.keys(groupedLogs).length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="font-serif">No reading history yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedLogs).map(([date, dayLogs]: [string, any]) => (
              <div key={date}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 pl-1">{date}</h3>
                <div className="bg-white border border-black/10 rounded-xl shadow-sm overflow-hidden">
                  {dayLogs.map((log, idx) => (
                    <div key={log.id} className={`p-3 flex items-center justify-between ${idx !== dayLogs.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <div className="min-w-0 flex-1 pr-4">
                        <div className="font-medium text-sm truncate">{log.title}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-sm flex-shrink-0">
                        <span className="text-gray-400">{log.from}</span>
                        <ArrowRight size={12} className="text-gray-300" />
                        <span className="font-semibold text-mv-primary">{log.to}</span>
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded ml-1">+{log.delta}</span>
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

    const addSite = () => {
      if (siteName && siteUrl) {
        setSites(prev => [...prev, { id: generateId(), name: siteName, url: siteUrl, type: 'General' }]);
        setSiteName('');
        setSiteUrl('');
      }
    };

    const removeSite = (id: string) => {
      setSites(prev => prev.filter(s => s.id !== id));
    };

    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <h1 className="font-serif font-bold text-2xl mb-6">Saved Sites</h1>

        <div className="bg-white p-4 rounded-xl border border-black/10 shadow-sm mb-6">
          <h2 className="font-serif font-semibold mb-3 text-sm">Add New Site</h2>
          <div className="flex flex-col gap-3">
            <input type="text" placeholder="Site Name (e.g., Asura Scans)" className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-mv-primary" value={siteName} onChange={e => setSiteName(e.target.value)} />
            <input type="url" placeholder="URL (e.g., https://asurascans.com)" className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-mv-primary" value={siteUrl} onChange={e => setSiteUrl(e.target.value)} />
            <button onClick={addSite} className="bg-mv-primary text-white px-4 py-2 rounded-lg font-medium text-sm active:bg-mv-primary/90">Add Site</button>
          </div>
        </div>

        <div className="space-y-3">
          {sites.map(site => (
            <div key={site.id} className="bg-white border border-black/10 rounded-xl p-3 flex justify-between items-center shadow-sm">
              <div className="min-w-0 pr-4">
                <div className="font-medium text-sm truncate">{site.name}</div>
                <a href={site.url} target="_blank" rel="noreferrer" className="text-xs text-mv-primary truncate block hover:underline">{site.url}</a>
              </div>
              <button onClick={() => removeSite(site.id)} className="p-2 text-red-500 active:bg-red-50 rounded-lg flex-shrink-0"><Trash2 size={18} /></button>
            </div>
          ))}
          {sites.length === 0 && <p className="text-center text-gray-400 text-sm py-4">No sites saved.</p>}
        </div>
      </div>
    );
  };

  const ImportExportPage = () => {
    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          const importedTitles = Array.isArray(data) ? data : (data.titles || []);
          
          let added = 0;
          const newTitles = [...titles];

          importedTitles.forEach((item: any) => {
            const titleStr = item.title || item.name || '';
            if (!titleStr) return;

            // Check duplicate
            const exists = newTitles.find(t => t.title.toLowerCase() === titleStr.toLowerCase());
            if (!exists) {
              newTitles.push({
                id: item.id || generateId(),
                title: titleStr,
                type: item.type || 'Manhwa',
                status: item.status || 'Reading',
                ch: parseInt(item.ch || item.chapter || '0', 10) || 0,
                total: parseInt(item.total || '0', 10) || 0,
                cover: item.cover || item.image || item.coverUrl || item.imageUrl || item.thumbnail || item.thumb || item.picture || '',
                url: item.url || item.link || item.siteUrl || item.source || item.href || item.readUrl || item.lastReadUrl || '',
                site: item.site || '',
                rating: item.rating || 0,
                tags: Array.isArray(item.tags) ? item.tags : [],
                fav: !!item.fav,
                note: item.note || '',
                updated: item.updated || Date.now()
              });
              added++;
            }
          });

          setTitles(newTitles);
          showToast(`Successfully imported ${added} new titles.`);
        } catch (err) {
          showToast("Invalid JSON file.");
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
        message: 'WARNING: This will permanently delete ALL your titles, reading logs, and saved sites. This action cannot be undone. Are you absolutely sure?',
        onConfirm: () => {
          setTitles([]);
          setLogs([]);
          setSites([]);
          showToast('All data has been cleared.');
        }
      });
    };

    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <h1 className="font-serif font-bold text-2xl mb-6">Data Management</h1>

        <div className="grid gap-4 md:grid-cols-2 mb-6">
          <div className="bg-white p-5 rounded-xl border border-black/10 shadow-sm flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-3">
              <Download size={24} />
            </div>
            <h2 className="font-serif font-semibold mb-1">Export Library</h2>
            <p className="text-sm text-gray-500 mb-4">Download your entire library as a JSON file for backup.</p>
            <button onClick={handleExport} className="w-full bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm active:bg-gray-50">
              Download JSON
            </button>
          </div>

          <div className="bg-white p-5 rounded-xl border border-black/10 shadow-sm flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-3">
              <Upload size={24} />
            </div>
            <h2 className="font-serif font-semibold mb-1">Import Library</h2>
            <p className="text-sm text-gray-500 mb-4">Upload a JSON file from another tracker or backup.</p>
            <div className="relative w-full">
              <input type="file" accept=".json" onChange={handleImport} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <button className="w-full bg-mv-primary text-white px-4 py-2 rounded-lg font-medium text-sm active:bg-mv-primary/90 pointer-events-none">
                Select JSON File
              </button>
            </div>
          </div>
        </div>

        <div className="bg-red-50 p-5 rounded-xl border border-red-100 shadow-sm flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-3">
            <Trash2 size={24} />
          </div>
          <h2 className="font-serif font-semibold mb-1 text-red-800">Danger Zone</h2>
          <p className="text-sm text-red-600/80 mb-4">Permanently delete all titles, reading history, and saved sites. This cannot be undone.</p>
          <button onClick={handleClearData} className="w-full bg-white border border-red-200 text-red-600 px-4 py-2 rounded-lg font-medium text-sm active:bg-red-50 hover:bg-red-50 transition-colors">
            Clear All Data
          </button>
        </div>
      </div>
    );
  };

  // --- Render ---
  return (
    <div className="flex flex-col h-screen bg-mv-bg text-gray-900 font-sans">
      
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex flex-col w-64 fixed h-full bg-white border-r border-black/5 z-40">
        <div className="p-6">
          <h1 className="font-serif font-bold text-2xl text-mv-primary tracking-tight">ManhwaVault</h1>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          {[
            { id: 'home', icon: Home, label: 'Library' },
            { id: 'stats', icon: BarChart2, label: 'Statistics' },
            { id: 'log', icon: ListIcon, label: 'Reading Log' },
            { id: 'sites', icon: Globe, label: 'Saved Sites' },
            { id: 'import', icon: Download, label: 'Data' },
          ].map(item => (
            <button 
              key={item.id}
              onClick={() => setCurrentTab(item.id as any)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${currentTab === item.id ? 'bg-mv-primary/10 text-mv-primary' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <item.icon size={18} /> {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0 md:pl-64 relative">
        {/* Mobile Header */}
        <div className="md:hidden sticky top-0 bg-white/80 backdrop-blur-md border-b border-black/5 p-4 z-30 flex justify-between items-center">
          <h1 className="font-serif font-bold text-xl text-mv-primary">ManhwaVault</h1>
          {currentTab === 'home' && (
            <button onClick={() => setEditingTitle({})} className="p-2 bg-mv-primary text-white rounded-full shadow-sm active:bg-mv-primary/90">
              <Plus size={18} />
            </button>
          )}
        </div>

        {/* Desktop FAB */}
        {currentTab === 'home' && (
          <button onClick={() => setEditingTitle({})} className="hidden md:flex fixed bottom-8 right-8 bg-mv-primary text-white p-4 rounded-full shadow-lg hover:bg-mv-primary/90 transition-transform hover:scale-105 z-40">
            <Plus size={24} />
          </button>
        )}

        {currentTab === 'home' && <HomePage />}
        {currentTab === 'stats' && <StatsPage />}
        {currentTab === 'log' && <LogPage />}
        {currentTab === 'sites' && <SitesPage />}
        {currentTab === 'import' && <ImportExportPage />}
      </main>

      {/* Bottom Nav (Mobile) */}
      <nav className="md:hidden fixed bottom-0 w-full bg-white border-t border-black/5 flex justify-around items-center h-16 z-40 pb-safe">
        {[
          { id: 'home', icon: Home, label: 'Home' },
          { id: 'stats', icon: BarChart2, label: 'Stats' },
          { id: 'log', icon: ListIcon, label: 'Log' },
          { id: 'sites', icon: Globe, label: 'Sites' },
          { id: 'import', icon: Download, label: 'Data' },
        ].map(item => (
          <button 
            key={item.id}
            onClick={() => setCurrentTab(item.id as any)}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${currentTab === item.id ? 'text-mv-primary' : 'text-gray-400'}`}
          >
            <item.icon size={20} strokeWidth={currentTab === item.id ? 2.5 : 2} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      <TitleEditorModal />
      <button onClick={() => supabase.auth.signOut()} className="fixed top-4 right-4 text-xs text-gray-400">Sign Out</button>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-xl z-50 flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
          <Check size={18} className="text-green-400" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-6 flex flex-col gap-4">
            <h2 className="font-serif font-bold text-xl text-gray-900">{confirmDialog.title}</h2>
            <p className="text-gray-600 text-sm">{confirmDialog.message}</p>
            <div className="flex gap-3 mt-2">
              <button 
                onClick={() => setConfirmDialog(null)} 
                className="flex-1 px-4 py-2.5 rounded-xl font-medium text-sm bg-gray-100 text-gray-700 active:bg-gray-200"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }} 
                className="flex-1 px-4 py-2.5 rounded-xl font-medium text-sm bg-red-600 text-white active:bg-red-700"
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

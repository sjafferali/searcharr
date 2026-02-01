import React, { useState } from 'react';
import { Search, Settings, Plus, Trash2, Server, Download, Filter, ChevronDown, ChevronRight, ExternalLink, Check, X, Zap, Database, HardDrive, RefreshCw, Eye, EyeOff, Copy, AlertCircle, CheckCircle2, Loader2, Magnet, FileDown, Clock, Users, ArrowUpDown, Star, Bookmark } from 'lucide-react';

// Mock data for demonstration
const mockInstances = {
  jackett: [
    { id: 1, name: 'Jackett Primary', url: 'http://192.168.1.100:9117', apiKey: 'abc123...', status: 'online', indexers: 45 },
    { id: 2, name: 'Jackett Backup', url: 'http://192.168.1.101:9117', apiKey: 'def456...', status: 'offline', indexers: 32 },
  ],
  prowlarr: [
    { id: 1, name: 'Prowlarr Main', url: 'http://192.168.1.100:9696', apiKey: 'ghi789...', status: 'online', indexers: 67 },
  ],
  clients: [
    { id: 1, name: 'qBittorrent', type: 'qbittorrent', url: 'http://192.168.1.100:8080', status: 'online' },
    { id: 2, name: 'Transmission', type: 'transmission', url: 'http://192.168.1.100:9091', status: 'online' },
    { id: 3, name: 'Deluge', type: 'deluge', url: 'http://192.168.1.100:8112', status: 'offline' },
  ]
};

const mockResults = [
  { id: 1, title: 'Ubuntu 24.04 LTS Desktop (64-bit)', source: 'Jackett Primary', indexer: '1337x', size: '4.7 GB', seeders: 2847, leechers: 156, date: '2024-04-25', category: 'Software', bookmarked: false },
  { id: 2, title: 'Debian 12.5.0 AMD64 DVD ISO', source: 'Prowlarr Main', indexer: 'RARBG', size: '3.9 GB', seeders: 1523, leechers: 89, date: '2024-03-15', category: 'Software', bookmarked: true },
  { id: 3, title: 'Arch Linux 2024.04.01 x86_64', source: 'Jackett Primary', indexer: 'TorrentGalaxy', size: '892 MB', seeders: 956, leechers: 34, date: '2024-04-01', category: 'Software', bookmarked: false },
  { id: 4, title: 'Fedora Workstation 40 Live x86_64', source: 'Prowlarr Main', indexer: 'LimeTorrents', size: '2.1 GB', seeders: 678, leechers: 45, date: '2024-04-20', category: 'Software', bookmarked: false },
  { id: 5, title: 'Linux Mint 21.3 Cinnamon Edition', source: 'Jackett Backup', indexer: 'EZTV', size: '2.8 GB', seeders: 1234, leechers: 67, date: '2024-01-10', category: 'Software', bookmarked: false },
  { id: 6, title: 'Pop!_OS 22.04 LTS NVIDIA', source: 'Prowlarr Main', indexer: 'Nyaa', size: '3.2 GB', seeders: 445, leechers: 23, date: '2024-02-28', category: 'Software', bookmarked: true },
];

const categories = ['All', 'Movies', 'TV', 'Music', 'Software', 'Games', 'Books', 'Anime', 'Other'];
const clientTypes = [
  { value: 'qbittorrent', label: 'qBittorrent' },
  { value: 'transmission', label: 'Transmission' },
  { value: 'deluge', label: 'Deluge' },
  { value: 'rtorrent', label: 'rTorrent' },
  { value: 'aria2', label: 'Aria2' },
];

export default function TorrentAggregator() {
  const [activeTab, setActiveTab] = useState('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [results, setResults] = useState(mockResults);
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [instances, setInstances] = useState(mockInstances);
  const [selectedInstances, setSelectedInstances] = useState(['jackett-1', 'prowlarr-1']);
  const [sortBy, setSortBy] = useState('seeders');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showAddModal, setShowAddModal] = useState(null);
  const [showDownloadModal, setShowDownloadModal] = useState(null);
  const [minSeeders, setMinSeeders] = useState(0);
  const [maxSize, setMaxSize] = useState('');
  const [downloadingIds, setDownloadingIds] = useState([]);

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setTimeout(() => {
      setIsSearching(false);
    }, 1500);
  };

  const handleDownload = (result, clientId) => {
    setDownloadingIds(prev => [...prev, result.id]);
    setTimeout(() => {
      setDownloadingIds(prev => prev.filter(id => id !== result.id));
      setShowDownloadModal(null);
    }, 2000);
  };

  const toggleBookmark = (id) => {
    setResults(prev => prev.map(r => r.id === id ? { ...r, bookmarked: !r.bookmarked } : r));
  };

  const StatusBadge = ({ status }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
      status === 'online'
        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
        : 'bg-red-500/20 text-red-400 border border-red-500/30'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
      {status}
    </span>
  );

  const InstanceCard = ({ instance, type, onDelete }) => (
    <div className="group relative bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 hover:border-cyan-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/5">
      <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {type === 'client' ? (
            <HardDrive className="w-5 h-5 text-violet-400" />
          ) : type === 'jackett' ? (
            <Zap className="w-5 h-5 text-amber-400" />
          ) : (
            <Database className="w-5 h-5 text-cyan-400" />
          )}
          <h4 className="font-semibold text-slate-200">{instance.name}</h4>
        </div>
        <StatusBadge status={instance.status} />
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-slate-400">
          <Server className="w-3.5 h-3.5" />
          <span className="font-mono text-xs truncate">{instance.url}</span>
        </div>
        {instance.apiKey && (
          <div className="flex items-center gap-2 text-slate-400">
            <Eye className="w-3.5 h-3.5" />
            <span className="font-mono text-xs">{instance.apiKey}</span>
          </div>
        )}
        {instance.indexers !== undefined && (
          <div className="flex items-center gap-2 text-slate-400">
            <Database className="w-3.5 h-3.5" />
            <span>{instance.indexers} indexers</span>
          </div>
        )}
        {instance.type && (
          <div className="flex items-center gap-2 text-slate-400">
            <Download className="w-3.5 h-3.5" />
            <span className="capitalize">{instance.type}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-700/50">
        <button className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-slate-700/50 text-slate-300 text-xs font-medium hover:bg-slate-700 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
          Test
        </button>
        <button className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-slate-700/50 text-slate-300 text-xs font-medium hover:bg-slate-700 transition-colors">
          <Settings className="w-3.5 h-3.5" />
          Edit
        </button>
        <button
          onClick={onDelete}
          className="flex items-center justify-center p-1.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  const AddInstanceModal = ({ type, onClose }) => {
    const [formData, setFormData] = useState({
      name: '',
      url: '',
      apiKey: '',
      username: '',
      password: '',
      clientType: 'qbittorrent'
    });

    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
            <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <Plus className="w-5 h-5 text-cyan-400" />
              Add {type === 'client' ? 'Download Client' : type.charAt(0).toUpperCase() + type.slice(1)} Instance
            </h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Display Name</label>
              <input
                type="text"
                placeholder={`My ${type.charAt(0).toUpperCase() + type.slice(1)}`}
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all"
              />
            </div>
            {type === 'client' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Client Type</label>
                <select
                  value={formData.clientType}
                  onChange={e => setFormData({ ...formData, clientType: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all"
                >
                  {clientTypes.map(ct => (
                    <option key={ct.value} value={ct.value}>{ct.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">URL</label>
              <input
                type="text"
                placeholder="http://192.168.1.100:9117"
                value={formData.url}
                onChange={e => setFormData({ ...formData, url: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 font-mono text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all"
              />
            </div>
            {type !== 'client' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">API Key</label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="Enter API key"
                    value={formData.apiKey}
                    onChange={e => setFormData({ ...formData, apiKey: e.target.value })}
                    className="w-full px-3 py-2 pr-10 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 font-mono text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all"
                  />
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200">
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            {type === 'client' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Username</label>
                  <input
                    type="text"
                    placeholder="admin"
                    value={formData.username}
                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all"
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 p-4 border-t border-slate-700 bg-slate-800/50 rounded-b-xl">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-slate-600 text-slate-300 font-medium hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:from-cyan-400 hover:to-blue-400 transition-all shadow-lg shadow-cyan-500/25"
            >
              Add Instance
            </button>
          </div>
        </div>
      </div>
    );
  };

  const DownloadModal = ({ result, onClose }) => (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Download className="w-5 h-5 text-emerald-400" />
            Send to Download Client
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          <div className="bg-slate-800/50 rounded-lg p-3 mb-4 border border-slate-700/50">
            <p className="text-slate-200 font-medium text-sm line-clamp-2">{result.title}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
              <span>{result.size}</span>
              <span>•</span>
              <span className="text-emerald-400">{result.seeders} seeders</span>
              <span>•</span>
              <span>{result.source}</span>
            </div>
          </div>
          <h4 className="text-sm font-medium text-slate-300 mb-3">Select Download Client</h4>
          <div className="space-y-2">
            {instances.clients.filter(c => c.status === 'online').map(client => (
              <button
                key={client.id}
                onClick={() => handleDownload(result, client.id)}
                disabled={downloadingIds.includes(result.id)}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 hover:bg-slate-800 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center border border-violet-500/30">
                    <HardDrive className="w-5 h-5 text-violet-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-slate-200 font-medium">{client.name}</p>
                    <p className="text-xs text-slate-400 font-mono">{client.url}</p>
                  </div>
                </div>
                {downloadingIds.includes(result.id) ? (
                  <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                )}
              </button>
            ))}
          </div>
          {instances.clients.filter(c => c.status === 'offline').length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-700/50">
              <p className="text-xs text-slate-500 mb-2">Offline clients</p>
              {instances.clients.filter(c => c.status === 'offline').map(client => (
                <div key={client.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 opacity-50">
                  <HardDrive className="w-5 h-5 text-slate-500" />
                  <span className="text-slate-400">{client.name}</span>
                  <StatusBadge status="offline" />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-slate-700 bg-slate-800/50 rounded-b-xl">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg border border-slate-600 text-slate-300 font-medium hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
      {/* Ambient background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950" />
        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
            backgroundSize: '50px 50px'
          }}
        />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
                    <Magnet className="w-5 h-5 text-white" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-900" />
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight">
                    <span className="text-cyan-400">Search</span>
                    <span className="text-slate-200">arr</span>
                  </h1>
                  <p className="text-[10px] text-slate-500 tracking-widest uppercase">Unified Search Aggregator</p>
                </div>
              </div>

              {/* Navigation Tabs */}
              <nav className="flex items-center gap-1 bg-slate-800/50 p-1 rounded-lg border border-slate-700/50">
                {[
                  { id: 'search', label: 'Search', icon: Search },
                  { id: 'instances', label: 'Instances', icon: Server },
                  { id: 'clients', label: 'Clients', icon: HardDrive },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                      activeTab === tab.id
                        ? 'bg-slate-700 text-cyan-400 shadow-lg shadow-cyan-500/10'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
              </nav>

              {/* Quick Stats */}
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-slate-400">{instances.jackett.filter(i => i.status === 'online').length + instances.prowlarr.filter(i => i.status === 'online').length} sources online</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-6">
          {/* Search Tab */}
          {activeTab === 'search' && (
            <div className="space-y-6">
              {/* Search Bar */}
              <div className="relative">
                <div className="flex gap-3">
                  <div className="flex-1 relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
                    <div className="relative flex items-center bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden focus-within:border-cyan-500/50 transition-all">
                      <Search className="w-5 h-5 text-slate-400 ml-4" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        placeholder="Search across all indexers..."
                        className="flex-1 px-4 py-4 bg-transparent text-slate-200 placeholder-slate-500 focus:outline-none text-sm"
                      />
                      <select
                        value={selectedCategory}
                        onChange={e => setSelectedCategory(e.target.value)}
                        className="h-full px-4 py-4 bg-slate-700/50 border-l border-slate-600/50 text-slate-200 focus:outline-none cursor-pointer text-sm"
                      >
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={isSearching}
                    className="px-8 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:from-cyan-400 hover:to-blue-400 transition-all shadow-lg shadow-cyan-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSearching ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search className="w-5 h-5" />
                        Search
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Filters Panel */}
              <div className="bg-slate-900/50 border border-slate-800/50 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800/30 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-cyan-400" />
                    Filters & Sources
                  </span>
                  {showFilters ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                {showFilters && (
                  <div className="px-4 pb-4 space-y-4 border-t border-slate-800/50">
                    {/* Source Selection */}
                    <div className="pt-4">
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Search Sources</p>
                      <div className="flex flex-wrap gap-2">
                        {[...instances.jackett.map(i => ({ ...i, type: 'jackett' })), ...instances.prowlarr.map(i => ({ ...i, type: 'prowlarr' }))].map(instance => (
                          <button
                            key={`${instance.type}-${instance.id}`}
                            onClick={() => {
                              const key = `${instance.type}-${instance.id}`;
                              setSelectedInstances(prev =>
                                prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
                              );
                            }}
                            disabled={instance.status === 'offline'}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              selectedInstances.includes(`${instance.type}-${instance.id}`)
                                ? instance.type === 'jackett'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                            } ${instance.status === 'offline' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {instance.type === 'jackett' ? <Zap className="w-3 h-3" /> : <Database className="w-3 h-3" />}
                            {instance.name}
                            {selectedInstances.includes(`${instance.type}-${instance.id}`) && <Check className="w-3 h-3" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Filter Options */}
                    <div className="grid grid-cols-4 gap-4 pt-4 border-t border-slate-800/50">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-2">Min Seeders</label>
                        <input
                          type="number"
                          value={minSeeders}
                          onChange={e => setMinSeeders(Number(e.target.value))}
                          placeholder="0"
                          className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-2">Max Size</label>
                        <input
                          type="text"
                          value={maxSize}
                          onChange={e => setMaxSize(e.target.value)}
                          placeholder="e.g. 10GB"
                          className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-2">Sort By</label>
                        <select
                          value={sortBy}
                          onChange={e => setSortBy(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                        >
                          <option value="seeders">Seeders</option>
                          <option value="size">Size</option>
                          <option value="date">Date</option>
                          <option value="name">Name</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-2">Order</label>
                        <select
                          value={sortOrder}
                          onChange={e => setSortOrder(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                        >
                          <option value="desc">Descending</option>
                          <option value="asc">Ascending</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Results */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-400">
                    {results.length} results found
                  </p>
                  <div className="flex items-center gap-2">
                    <button className="p-2 rounded-lg bg-slate-800/50 text-slate-400 hover:text-cyan-400 transition-colors">
                      <ArrowUpDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Results Table */}
                <div className="bg-slate-900/50 border border-slate-800/50 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-800/50">
                          <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Title</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Source</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Size</th>
                          <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">S/L</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Date</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/30">
                        {results.map((result, idx) => (
                          <tr
                            key={result.id}
                            className="hover:bg-slate-800/30 transition-colors group"
                            style={{ animationDelay: `${idx * 50}ms` }}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-start gap-3">
                                <button
                                  onClick={() => toggleBookmark(result.id)}
                                  className={`mt-0.5 p-1 rounded transition-colors ${
                                    result.bookmarked
                                      ? 'text-amber-400'
                                      : 'text-slate-600 hover:text-slate-400'
                                  }`}
                                >
                                  <Bookmark className={`w-4 h-4 ${result.bookmarked ? 'fill-current' : ''}`} />
                                </button>
                                <div>
                                  <p className="text-sm font-medium text-slate-200 group-hover:text-cyan-300 transition-colors line-clamp-1">
                                    {result.title}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-700/50 text-slate-400">
                                      {result.category}
                                    </span>
                                    <span className="text-[10px] text-slate-500">{result.indexer}</span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
                                result.source.includes('Jackett')
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                              }`}>
                                {result.source.includes('Jackett') ? <Zap className="w-3 h-3" /> : <Database className="w-3 h-3" />}
                                {result.source}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-300 font-mono">
                              {result.size}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-2 text-xs">
                                <span className="text-emerald-400 font-medium flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {result.seeders.toLocaleString()}
                                </span>
                                <span className="text-slate-600">/</span>
                                <span className="text-red-400">{result.leechers}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-400">
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                {result.date}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-2">
                                <button className="p-2 rounded-lg bg-slate-800/50 text-slate-400 hover:text-cyan-400 hover:bg-slate-700/50 transition-all" title="Copy Magnet">
                                  <Magnet className="w-4 h-4" />
                                </button>
                                <button className="p-2 rounded-lg bg-slate-800/50 text-slate-400 hover:text-violet-400 hover:bg-slate-700/50 transition-all" title="Download .torrent">
                                  <FileDown className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setShowDownloadModal(result)}
                                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-emerald-500/20 to-green-500/20 text-emerald-400 border border-emerald-500/30 hover:from-emerald-500/30 hover:to-green-500/30 transition-all text-xs font-medium"
                                >
                                  <Download className="w-4 h-4" />
                                  Send
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Instances Tab */}
          {activeTab === 'instances' && (
            <div className="space-y-8">
              {/* Jackett Section */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center border border-amber-500/30">
                      <Zap className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-100">Jackett Instances</h2>
                      <p className="text-xs text-slate-400">{instances.jackett.length} configured • {instances.jackett.filter(i => i.status === 'online').length} online</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAddModal('jackett')}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Add Jackett
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {instances.jackett.map(instance => (
                    <InstanceCard key={instance.id} instance={instance} type="jackett" />
                  ))}
                </div>
              </section>

              {/* Prowlarr Section */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center border border-cyan-500/30">
                      <Database className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-100">Prowlarr Instances</h2>
                      <p className="text-xs text-slate-400">{instances.prowlarr.length} configured • {instances.prowlarr.filter(i => i.status === 'online').length} online</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAddModal('prowlarr')}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 transition-colors text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Add Prowlarr
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {instances.prowlarr.map(instance => (
                    <InstanceCard key={instance.id} instance={instance} type="prowlarr" />
                  ))}
                  {instances.prowlarr.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center py-12 bg-slate-900/30 rounded-xl border border-dashed border-slate-700">
                      <Database className="w-12 h-12 text-slate-600 mb-3" />
                      <p className="text-slate-400 text-sm">No Prowlarr instances configured</p>
                      <button
                        onClick={() => setShowAddModal('prowlarr')}
                        className="mt-3 text-cyan-400 text-sm font-medium hover:underline"
                      >
                        Add your first instance
                      </button>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* Clients Tab */}
          {activeTab === 'clients' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center border border-violet-500/30">
                    <HardDrive className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-100">Download Clients</h2>
                    <p className="text-xs text-slate-400">{instances.clients.length} configured • {instances.clients.filter(i => i.status === 'online').length} online</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddModal('client')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/30 hover:bg-violet-500/20 transition-colors text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add Client
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {instances.clients.map(client => (
                  <InstanceCard key={client.id} instance={client} type="client" />
                ))}
              </div>

              {/* Supported Clients Info */}
              <div className="bg-slate-900/30 border border-slate-800/50 rounded-xl p-6">
                <h3 className="text-sm font-medium text-slate-300 mb-4">Supported Download Clients</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {clientTypes.map(ct => (
                    <div key={ct.value} className="flex items-center gap-2 px-3 py-2 bg-slate-800/30 rounded-lg">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm text-slate-300">{ct.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      {showAddModal && <AddInstanceModal type={showAddModal} onClose={() => setShowAddModal(null)} />}
      {showDownloadModal && <DownloadModal result={showDownloadModal} onClose={() => setShowDownloadModal(null)} />}

      {/* Load Google Font */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        tbody tr {
          animation: fadeIn 0.3s ease-out forwards;
        }

        .line-clamp-1 {
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}

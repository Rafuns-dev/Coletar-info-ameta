import {
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Filter,
  Loader2,
  LogOut,
  RotateCcw,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AmetaLogo } from '../components/AmetaLogo.tsx';
import { RegistrationFullscreenModal } from '../components/RegistrationFullscreenModal.tsx';
import { TeamManagementModal } from '../components/TeamManagementModal.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import {
  extractFriendlyFirestoreMessage,
  subscribeToCadastros,
} from '../services/firestoreService.ts';
import {
  MARITAL_STATUS_OPTIONS,
  REGISTRATION_STATUS_OPTIONS,
  ROLE_OPTIONS,
  type RegistrationStatus,
} from '../shared/formConfig.ts';
import type {
  ContractorRegistrationDetail,
  PanelUserProfile,
} from '../shared/schema.ts';
import {
  filterAndSortRegistrations,
  type SortOption,
} from '../shared/searchFilters.ts';
import {
  formatDateBR,
  getTodayISODate,
  maskCPFForList,
  maskRGForList,
} from '../shared/validators.ts';
import { exportFilteredListToPdf } from '../utils/pdfExport.ts';
import {
  exportRegistrationsToCsv,
  exportRegistrationsToExcel,
} from '../utils/spreadsheetExport.ts';

interface AdminDashboardPageProps {
  user: PanelUserProfile;
  isDark: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
  onNavigate: (path: string) => void;
}

interface FilterState {
  search: string;
  roles: string[];
  maritalStatus: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  birthPlace: string;
  nationality: string;
  unseenOnly: boolean;
  sort: SortOption;
  page: number;
  viewId: string | null;
}

const VALID_SORTS: SortOption[] = [
  'registrationDate:desc',
  'registrationDate:asc',
  'fullName:asc',
  'fullName:desc',
  'status:asc',
];

function readStateFromUrl(): FilterState {
  const params = new URLSearchParams(window.location.search);
  const rolesParam = params.get('roles') || '';
  const roles = rolesParam
    .split(',')
    .map((s) => s.trim())
    .filter((r) => (ROLE_OPTIONS as readonly string[]).includes(r));

  const sortRaw = params.get('sort') || 'registrationDate:desc';
  const sort = VALID_SORTS.includes(sortRaw as SortOption)
    ? (sortRaw as SortOption)
    : 'registrationDate:desc';

  return {
    search: params.get('q') || '',
    roles,
    maritalStatus: params.get('maritalStatus') || 'ALL',
    status: params.get('status') || 'ALL',
    dateFrom: params.get('dateFrom') || '',
    dateTo: params.get('dateTo') || '',
    birthPlace: params.get('birthPlace') || '',
    nationality: params.get('nationality') || '',
    unseenOnly: params.get('unseenOnly') === '1',
    sort,
    page: Math.max(1, Number(params.get('page') || 1) || 1),
    viewId: params.get('ver') || null,
  };
}

function writeStateToUrl(state: FilterState): void {
  const params = new URLSearchParams();
  if (state.search.trim()) params.set('q', state.search.trim());
  if (state.roles.length > 0) params.set('roles', state.roles.join(','));
  if (state.maritalStatus !== 'ALL') params.set('maritalStatus', state.maritalStatus);
  if (state.status !== 'ALL') params.set('status', state.status);
  if (state.dateFrom) params.set('dateFrom', state.dateFrom);
  if (state.dateTo) params.set('dateTo', state.dateTo);
  if (state.birthPlace.trim()) params.set('birthPlace', state.birthPlace.trim());
  if (state.nationality.trim()) params.set('nationality', state.nationality.trim());
  if (state.unseenOnly) params.set('unseenOnly', '1');
  if (state.sort !== 'registrationDate:desc') params.set('sort', state.sort);
  if (state.page > 1) params.set('page', String(state.page));
  if (state.viewId) params.set('ver', state.viewId);

  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (nextUrl !== currentUrl) {
    window.history.replaceState({}, '', nextUrl);
  }
}

function getDateShortcutRange(preset: 'today' | '7d' | '30d' | 'month'): {
  dateFrom: string;
  dateTo: string;
} {
  const todayStr = getTodayISODate();
  const [y, m, d] = todayStr.split('-').map(Number);
  const todayUtc = new Date(Date.UTC(y, m - 1, d));

  const toIso = (dt: Date) => dt.toISOString().slice(0, 10);

  if (preset === 'today') {
    return { dateFrom: todayStr, dateTo: todayStr };
  }
  if (preset === '7d') {
    const start = new Date(todayUtc);
    start.setUTCDate(start.getUTCDate() - 6);
    return { dateFrom: toIso(start), dateTo: todayStr };
  }
  if (preset === '30d') {
    const start = new Date(todayUtc);
    start.setUTCDate(start.getUTCDate() - 29);
    return { dateFrom: toIso(start), dateTo: todayStr };
  }
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  return { dateFrom: toIso(monthStart), dateTo: todayStr };
}

function getStatusBadgeClasses(status: RegistrationStatus): string {
  switch (status) {
    case 'Novo':
      return 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900';
    case 'Em análise':
      return 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900';
    case 'Dados conferidos':
      return 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-900';
    case 'Concluído':
      return 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900';
    default:
      return 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
  }
}

export function AdminDashboardPage({
  user,
  isDark,
  onToggleTheme,
  onLogout,
  onNavigate,
}: AdminDashboardPageProps) {
  const initialState = useMemo(() => readStateFromUrl(), []);

  const [search, setSearch] = useState(initialState.search);
  const [debouncedSearch, setDebouncedSearch] = useState(initialState.search);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(initialState.roles);
  const [maritalStatus, setMaritalStatus] = useState(initialState.maritalStatus);
  const [statusFilter, setStatusFilter] = useState(initialState.status);
  const [dateFrom, setDateFrom] = useState(initialState.dateFrom);
  const [dateTo, setDateTo] = useState(initialState.dateTo);
  const [birthPlace, setBirthPlace] = useState(initialState.birthPlace);
  const [debouncedBirthPlace, setDebouncedBirthPlace] = useState(initialState.birthPlace);
  const [nationality, setNationality] = useState(initialState.nationality);
  const [debouncedNationality, setDebouncedNationality] = useState(initialState.nationality);
  const [unseenOnly, setUnseenOnly] = useState(initialState.unseenOnly);
  const [sort, setSort] = useState<SortOption>(initialState.sort);
  const [page, setPage] = useState(initialState.page);
  const [fullscreenId, setFullscreenId] = useState<string | null>(initialState.viewId);
  const [modalOrderedIds, setModalOrderedIds] = useState<string[]>([]);

  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const roleMenuRef = useRef<HTMLDivElement>(null);

  const [allRecords, setAllRecords] = useState<ContractorRegistrationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCounter, setRetryCounter] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [newArrivalToast, setNewArrivalToast] = useState<{
    id: string;
    fullName: string;
    role: string;
  } | null>(null);

  const knownIdsRef = useRef<Set<string> | null>(null);
  const pageSize = 15;

  // Debounce dos campos de texto para busca em tempo real fluida
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setDebouncedBirthPlace(birthPlace);
      setDebouncedNationality(nationality);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [search, birthPlace, nationality]);

  // Fechar popover de seleção múltipla de funções ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (roleMenuRef.current && !roleMenuRef.current.contains(event.target as Node)) {
        setRoleMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sincronizar filtros e ficha aberta com a URL
  useEffect(() => {
    writeStateToUrl({
      search: debouncedSearch,
      roles: selectedRoles,
      maritalStatus,
      status: statusFilter,
      dateFrom,
      dateTo,
      birthPlace: debouncedBirthPlace,
      nationality: debouncedNationality,
      unseenOnly,
      sort,
      page,
      viewId: fullscreenId,
    });
  }, [
    debouncedSearch,
    selectedRoles,
    maritalStatus,
    statusFilter,
    dateFrom,
    dateTo,
    debouncedBirthPlace,
    debouncedNationality,
    unseenOnly,
    sort,
    page,
    fullscreenId,
  ]);

  // Listener em tempo real do Firestore (contador de Novos e aviso de novo cadastro)
  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToCadastros(
      (records) => {
        if (knownIdsRef.current === null) {
          knownIdsRef.current = new Set(records.map((r) => r.id));
        } else {
          const arrivals = records.filter((r) => !knownIdsRef.current!.has(r.id));
          if (arrivals.length > 0) {
            const latest = arrivals[0];
            setNewArrivalToast({
              id: latest.id,
              fullName: latest.fullName,
              role: latest.role,
            });
          }
          knownIdsRef.current = new Set(records.map((r) => r.id));
        }
        setAllRecords(records);
        setLoading(false);
      },
      (err) => {
        setError(extractFriendlyFirestoreMessage(err, 'Erro ao carregar cadastros.'));
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [retryCounter]);

  const newStatusCount = useMemo(
    () => allRecords.filter((item) => item.status === 'Novo').length,
    [allRecords]
  );

  const filteredRecords = useMemo(
    () =>
      filterAndSortRegistrations(allRecords, {
        search: debouncedSearch,
        roles: selectedRoles,
        maritalStatus,
        status: statusFilter,
        dateFrom,
        dateTo,
        birthPlace: debouncedBirthPlace,
        nationality: debouncedNationality,
        unseenOnly,
        sort,
      }),
    [
      allRecords,
      debouncedSearch,
      selectedRoles,
      maritalStatus,
      statusFilter,
      dateFrom,
      dateTo,
      debouncedBirthPlace,
      debouncedNationality,
      unseenOnly,
      sort,
    ]
  );

  const orderedIds = useMemo(
    () => filteredRecords.map((item) => item.id),
    [filteredRecords]
  );

  const total = filteredRecords.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const items = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, safePage, pageSize]);

  const openFullscreen = useCallback(
    (id: string) => {
      setModalOrderedIds(orderedIds.length > 0 ? orderedIds : [id]);
      setFullscreenId(id);
    },
    [orderedIds]
  );

  const handleCloseFullscreen = useCallback(() => {
    setFullscreenId(null);
    setModalOrderedIds([]);
  }, []);

  const allOnPageSelected =
    items.length > 0 && items.every((item) => selectedIds.includes(item.id));

  const toggleSelectAllOnPage = () => {
    if (allOnPageSelected) {
      const pageIdSet = new Set(items.map((item) => item.id));
      setSelectedIds((prev) => prev.filter((id) => !pageIdSet.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...items.map((i) => i.id)])));
    }
  };

  const toggleRowSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleRoleFilter = (role: string) => {
    setPage(1);
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const applyDatePreset = (preset: 'today' | '7d' | '30d' | 'month') => {
    const range = getDateShortcutRange(preset);
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
    setPage(1);
  };

  const getExportTargetRecords = (): ContractorRegistrationDetail[] => {
    if (selectedIds.length === 0) {
      return filteredRecords;
    }
    const selectedSet = new Set(selectedIds);
    return filteredRecords.filter((item) => selectedSet.has(item.id));
  };

  const handleExportSpreadsheet = (format: 'csv' | 'xlsx') => {
    const targetRecords = getExportTargetRecords();
    if (targetRecords.length === 0) return;

    if (format === 'csv') {
      exportRegistrationsToCsv(targetRecords);
    } else {
      exportRegistrationsToExcel(targetRecords);
    }
  };

  const handleExportFilteredPdf = () => {
    const targetRecords = getExportTargetRecords();
    if (targetRecords.length === 0) return;
    setExportingPdf(true);
    try {
      exportFilteredListToPdf(targetRecords);
    } finally {
      setExportingPdf(false);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setSelectedRoles([]);
    setMaritalStatus('ALL');
    setStatusFilter('ALL');
    setDateFrom('');
    setDateTo('');
    setBirthPlace('');
    setDebouncedBirthPlace('');
    setNationality('');
    setDebouncedNationality('');
    setUnseenOnly(false);
    setSort('registrationDate:desc');
    setPage(1);
    setSelectedIds([]);
  };

  // Chips dos filtros ativos
  const activeFilterChips: Array<{ key: string; label: string; onRemove: () => void }> = [];

  if (debouncedSearch.trim()) {
    activeFilterChips.push({
      key: 'search',
      label: `Busca: "${debouncedSearch.trim()}"`,
      onRemove: () => {
        setSearch('');
        setDebouncedSearch('');
        setPage(1);
      },
    });
  }

  for (const role of selectedRoles) {
    activeFilterChips.push({
      key: `role-${role}`,
      label: `Função: ${role}`,
      onRemove: () => toggleRoleFilter(role),
    });
  }

  if (maritalStatus !== 'ALL') {
    activeFilterChips.push({
      key: 'maritalStatus',
      label: `Estado Civil: ${maritalStatus}`,
      onRemove: () => {
        setMaritalStatus('ALL');
        setPage(1);
      },
    });
  }

  if (statusFilter !== 'ALL') {
    activeFilterChips.push({
      key: 'status',
      label: `Status: ${statusFilter}`,
      onRemove: () => {
        setStatusFilter('ALL');
        setPage(1);
      },
    });
  }

  if (dateFrom || dateTo) {
    const periodLabel =
      dateFrom && dateTo
        ? `Período: ${formatDateBR(dateFrom)} até ${formatDateBR(dateTo)}`
        : dateFrom
          ? `A partir de: ${formatDateBR(dateFrom)}`
          : `Até: ${formatDateBR(dateTo)}`;
    activeFilterChips.push({
      key: 'period',
      label: periodLabel,
      onRemove: () => {
        setDateFrom('');
        setDateTo('');
        setPage(1);
      },
    });
  }

  if (debouncedBirthPlace.trim()) {
    activeFilterChips.push({
      key: 'birthPlace',
      label: `Naturalidade: ${debouncedBirthPlace.trim()}`,
      onRemove: () => {
        setBirthPlace('');
        setDebouncedBirthPlace('');
        setPage(1);
      },
    });
  }

  if (debouncedNationality.trim()) {
    activeFilterChips.push({
      key: 'nationality',
      label: `Nacionalidade: ${debouncedNationality.trim()}`,
      onRemove: () => {
        setNationality('');
        setDebouncedNationality('');
        setPage(1);
      },
    });
  }

  if (unseenOnly) {
    activeFilterChips.push({
      key: 'unseenOnly',
      label: 'Apenas não vistos',
      onRemove: () => {
        setUnseenOnly(false);
        setPage(1);
      },
    });
  }

  const hasActiveFilters = activeFilterChips.length > 0;

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3.5">
        <div className="max-w-[1360px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <a
              href="/admin"
              onClick={(e) => {
                e.preventDefault();
                resetFilters();
              }}
              className="shrink-0"
            >
              <AmetaLogo size="sm" />
            </a>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700 hidden sm:inline">
              /
            </span>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300 truncate hidden sm:inline">
              Cadastros de Prestadores
            </span>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <span className="hidden md:inline text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
              {user.nome} ({user.perfil === 'administrador' ? 'Admin' : 'Operador'})
            </span>
            {user.perfil === 'administrador' && (
              <button
                type="button"
                onClick={() => setTeamModalOpen(true)}
                className="inline-flex h-10 items-center gap-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Equipe</span>
              </button>
            )}
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/');
              }}
              className="inline-flex h-10 items-center gap-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Formulário</span>
            </a>
            <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex h-10 items-center gap-1.5 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-8 py-8">
        {/* Aviso em tempo real quando chega novo cadastro */}
        {newArrivalToast && (
          <div
            role="status"
            className="mb-5 rounded-xl border border-blue-200 dark:border-blue-900/70 bg-blue-50 dark:bg-blue-950/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5 text-sm text-blue-950 dark:text-blue-100">
              <Bell className="h-4 w-4 text-blue-700 dark:text-blue-300 shrink-0" aria-hidden="true" />
              <span>
                Novo cadastro recebido: <strong>{newArrivalToast.fullName}</strong> ({newArrivalToast.role})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const targetId = newArrivalToast.id;
                  setNewArrivalToast(null);
                  openFullscreen(targetId);
                }}
                className="inline-flex h-8 items-center px-3 rounded-lg bg-[#0F2942] hover:bg-[#173A5C] text-white text-xs font-semibold transition-colors"
              >
                Abrir ficha
              </button>
              <button
                type="button"
                onClick={() => setNewArrivalToast(null)}
                aria-label="Dispensar aviso"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-blue-800 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/50"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* Cabeçalho da listagem + contador de Novos em tempo real + ações de exportação */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Cadastros Recebidos
              </h1>
              {!loading && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter(statusFilter === 'Novo' ? 'ALL' : 'Novo');
                    setPage(1);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/50 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors tabular-nums"
                >
                  <span>Novos: {newStatusCount}</span>
                </button>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 tabular-nums">
              {!loading
                ? `${total} ${total === 1 ? 'cadastro encontrado' : 'cadastros encontrados'}${
                    selectedIds.length > 0 ? ` · ${selectedIds.length} selecionado(s)` : ''
                  }`
                : 'Carregando cadastros em tempo real...'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => handleExportSpreadsheet('csv')}
              disabled={loading || total === 0}
              className="inline-flex h-10 items-center gap-2 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {selectedIds.length > 0 ? `CSV (${selectedIds.length})` : 'Exportar CSV'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleExportFilteredPdf}
              disabled={loading || total === 0 || exportingPdf}
              className="inline-flex h-10 items-center gap-2 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {exportingPdf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>
                {selectedIds.length > 0
                  ? `Exportar PDF (${selectedIds.length})`
                  : 'Exportar PDF'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleExportSpreadsheet('xlsx')}
              disabled={loading || total === 0}
              className="inline-flex h-10 items-center gap-2 px-4 rounded-lg bg-[#0F2942] hover:bg-[#173A5C] dark:bg-slate-100 dark:hover:bg-white text-xs font-semibold text-white dark:text-[#0F2942] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {selectedIds.length > 0
                  ? `Exportar Excel (${selectedIds.length})`
                  : 'Exportar Excel'}
              </span>
            </button>
          </div>
        </div>

        {/* Sistema completo de busca e filtros */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 mb-5 space-y-4">
          {/* Linha 1: Busca geral + Função (seleção múltipla) + Estado Civil + Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-2 lg:col-span-5">
              <label
                htmlFor="admin-search"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
              >
                Busca geral
              </label>
              <div className="relative">
                <Search
                  className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="admin-search"
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Nome, CPF, RG, CNPJ, e-mail ou telefone..."
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0F2942]/20 dark:focus:ring-slate-400/20"
                />
              </div>
            </div>

            {/* Seleção múltipla de Função */}
            <div className="lg:col-span-3 relative" ref={roleMenuRef}>
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Função
              </span>
              <button
                type="button"
                aria-expanded={roleMenuOpen}
                onClick={() => setRoleMenuOpen((prev) => !prev)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-left text-slate-900 dark:text-slate-100 flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-[#0F2942]/20"
              >
                <span className="truncate">
                  {selectedRoles.length === 0
                    ? 'Todas as funções'
                    : selectedRoles.length === 1
                      ? selectedRoles[0]
                      : `${selectedRoles.length} funções selecionadas`}
                </span>
                <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
              </button>

              {roleMenuOpen && (
                <div className="absolute left-0 right-0 mt-1.5 z-30 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-2 space-y-1">
                  {ROLE_OPTIONS.map((role) => {
                    const checked = selectedRoles.includes(role);
                    return (
                      <label
                        key={role}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-sm text-slate-700 dark:text-slate-200"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRoleFilter(role)}
                          className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 accent-[#0F2942]"
                        />
                        <span>{role}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Estado Civil */}
            <div className="lg:col-span-2">
              <label
                htmlFor="filter-marital-status"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
              >
                Estado Civil
              </label>
              <select
                id="filter-marital-status"
                value={maritalStatus}
                onChange={(e) => {
                  setMaritalStatus(e.target.value);
                  setPage(1);
                }}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2942]/20"
              >
                <option value="ALL">Todos</option>
                {MARITAL_STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div className="lg:col-span-2">
              <label
                htmlFor="filter-status"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
              >
                Status
              </label>
              <select
                id="filter-status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2942]/20"
              >
                <option value="ALL">Todos os status</option>
                {REGISTRATION_STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Linha 2: Período + Atalhos + Naturalidade + Nacionalidade + Apenas não vistos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-2">
              <label
                htmlFor="filter-date-from"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
              >
                Cadastro de
              </label>
              <input
                id="filter-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2942]/20"
              />
            </div>

            <div className="lg:col-span-2">
              <label
                htmlFor="filter-date-to"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
              >
                Até
              </label>
              <input
                id="filter-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F2942]/20"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Atalhos de período
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => applyDatePreset('today')}
                  className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('7d')}
                  className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                >
                  Últimos 7 dias
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('30d')}
                  className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                >
                  Últimos 30 dias
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('month')}
                  className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                >
                  Este mês
                </button>
              </div>
            </div>

            <div className="lg:col-span-2">
              <label
                htmlFor="filter-birthplace"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
              >
                Naturalidade
              </label>
              <input
                id="filter-birthplace"
                type="text"
                value={birthPlace}
                onChange={(e) => {
                  setBirthPlace(e.target.value);
                  setPage(1);
                }}
                placeholder="Ex: São Paulo"
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0F2942]/20"
              />
            </div>

            <div className="lg:col-span-2">
              <label
                htmlFor="filter-nationality"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
              >
                Nacionalidade
              </label>
              <input
                id="filter-nationality"
                type="text"
                value={nationality}
                onChange={(e) => {
                  setNationality(e.target.value);
                  setPage(1);
                }}
                placeholder="Ex: Brasileira"
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0F2942]/20"
              />
            </div>
          </div>

          {/* Linha 3: Apenas não vistos + Ordenação + Chips ativos */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-200 select-none">
                <input
                  type="checkbox"
                  checked={unseenOnly}
                  onChange={(e) => {
                    setUnseenOnly(e.target.checked);
                    setPage(1);
                  }}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 accent-[#0F2942]"
                />
                <span>Apenas não vistos</span>
              </label>

              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="text-xs font-medium text-[#0F2942] dark:text-slate-200 hover:underline"
                >
                  Limpar seleção ({selectedIds.length})
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="sort-select"
                className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
              >
                Ordenar por
              </label>
              <select
                id="sort-select"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as SortOption);
                  setPage(1);
                }}
                className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200"
              >
                <option value="registrationDate:desc">Data de cadastro (mais recente)</option>
                <option value="registrationDate:asc">Data de cadastro (mais antiga)</option>
                <option value="fullName:asc">Nome (A–Z)</option>
                <option value="fullName:desc">Nome (Z–A)</option>
                <option value="status:asc">Status</option>
              </select>
            </div>
          </div>

          {/* Chips dos filtros ativos + botão Limpar filtros */}
          {hasActiveFilters && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">
                <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Filtros ativos:</span>
              </span>
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onRemove}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
                >
                  <span>{chip.label}</span>
                  <X className="h-3 w-3 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                </button>
              ))}
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-[#0F2942] dark:text-slate-200 hover:underline ml-1"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                <span>Limpar filtros</span>
              </button>
            </div>
          )}
        </section>

        {/* Lista de cadastrados */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {error ? (
            <div className="p-8 text-center">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              <button
                type="button"
                onClick={() => setRetryCounter((c) => c + 1)}
                className="mt-3 inline-flex h-9 items-center px-4 rounded-lg bg-[#0F2942] text-white text-xs font-medium"
              >
                Tentar novamente
              </button>
            </div>
          ) : loading ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="px-4 py-3.5 flex items-center gap-4 animate-pulse">
                  <div className="h-4 w-4 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-4 w-52 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-4 w-36 rounded bg-slate-200 dark:bg-slate-800 hidden md:block" />
                  <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-800 hidden lg:block" />
                  <div className="ml-auto h-8 w-20 rounded bg-slate-200 dark:bg-slate-800" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Nenhum cadastro encontrado
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {hasActiveFilters
                  ? 'Tente ajustar ou remover alguns filtros aplicados.'
                  : 'Quando prestadores enviarem o formulário público, os registros aparecerão aqui em tempo real.'}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-4 inline-flex h-9 items-center px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 text-[12px] font-semibold text-slate-600 dark:text-slate-400">
                    <th className="py-3 pl-4 pr-2 w-10">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAllOnPage}
                        aria-label="Selecionar todos nesta página"
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 accent-[#0F2942]"
                      />
                    </th>
                    <th className="py-3 px-3 whitespace-nowrap">Nome Completo</th>
                    <th className="py-3 px-3 whitespace-nowrap">Função</th>
                    <th className="py-3 px-3 whitespace-nowrap">Data</th>
                    <th className="py-3 px-3 whitespace-nowrap">Status</th>
                    <th className="py-3 px-3 whitespace-nowrap">CPF</th>
                    <th className="py-3 px-3 whitespace-nowrap">RG</th>
                    <th className="py-3 pl-3 pr-4 text-right whitespace-nowrap">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[13px]">
                  {items.map((item) => {
                    const isChecked = selectedIds.includes(item.id);
                    const isUnseen = !item.viewed;
                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 pl-4 pr-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleRowSelection(item.id)}
                            aria-label={`Selecionar ${item.fullName}`}
                            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 accent-[#0F2942]"
                          />
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openFullscreen(item.id)}
                            className={`text-left hover:underline text-slate-900 dark:text-slate-100 ${
                              isUnseen ? 'font-bold' : 'font-medium'
                            }`}
                          >
                            {item.fullName}
                          </button>
                          {isUnseen && (
                            <span className="ml-2 text-[11px] font-medium text-blue-700 dark:text-blue-400">
                              · Não visto
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {item.role}
                        </td>
                        <td className="py-3 px-3 tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {formatDateBR(item.registrationDate)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium ${getStatusBadgeClasses(
                              item.status
                            )}`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {maskCPFForList(item.cpf)}
                        </td>
                        <td className="py-3 px-3 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {maskRGForList(item.rg)}
                        </td>
                        <td className="py-3 pl-3 pr-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openFullscreen(item.id)}
                            className="inline-flex h-8 items-center px-3 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                          >
                            Abrir ficha
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-400">
              <span className="tabular-nums">
                Página {safePage} de {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex h-8 items-center gap-1 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Anterior</span>
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex h-8 items-center gap-1 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <span>Próxima</span>
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Visualização em tela cheia */}
      {fullscreenId && (
        <RegistrationFullscreenModal
          registrationId={fullscreenId}
          orderedIds={
            modalOrderedIds.length > 0
              ? modalOrderedIds
              : orderedIds.length > 0
                ? orderedIds
                : [fullscreenId]
          }
          currentUser={user}
          onClose={handleCloseFullscreen}
          onSelectId={setFullscreenId}
        />
      )}

      {/* Gerenciamento de equipe (somente administrador) */}
      {teamModalOpen && user.perfil === 'administrador' && (
        <TeamManagementModal
          currentUser={user}
          onClose={() => setTeamModalOpen(false)}
        />
      )}
    </div>
  );
}

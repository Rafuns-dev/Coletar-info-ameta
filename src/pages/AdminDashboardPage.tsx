import {
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Copy,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  LayoutGrid,
  LayoutList,
  Loader2,
  MoreVertical,
  Moon,
  RotateCcw,
  ScrollText,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  UserCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminLayout, type AdminNavSection } from '../components/AdminLayout.tsx';
import { AnimatedCounter } from '../components/AnimatedCounter.tsx';
import { DiscountTermModal } from '../components/DiscountTermModal.tsx';
import { RegistrationFullscreenModal } from '../components/RegistrationFullscreenModal.tsx';
import { useToast } from '../components/ToastProvider.tsx';
import {
  extractFriendlyFirestoreMessage,
  recordTermRedownloadAudit,
  subscribeToAllAuditoria,
  subscribeToAllTermos,
  subscribeToCadastros,
  updateCadastroStatus,
} from '../services/firestoreService.ts';
import {
  MARITAL_STATUS_OPTIONS,
  REGISTRATION_STATUS_OPTIONS,
  ROLE_OPTIONS,
  type RegistrationStatus,
} from '../shared/formConfig.ts';
import type {
  AuditLogItem,
  ContractorRegistrationDetail,
  DiscountTermHistoryItem,
  PanelUserProfile,
} from '../shared/schema.ts';
import {
  filterAndSortRegistrations,
  type SortOption,
} from '../shared/searchFilters.ts';
import {
  formatDateBR,
  formatDateTimeBR,
  getTodayISODate,
  maskCPFForList,
  maskRGForList,
} from '../shared/validators.ts';
import { exportDiscountTermToDocx } from '../utils/discountTermDocx.ts';
import { exportDiscountTermToPdf } from '../utils/discountTermPdf.ts';
import {
  exportFilteredListToPdf,
  formatRegistrationAsText,
} from '../utils/pdfExport.ts';
import {
  exportRegistrationsToCsv,
  exportRegistrationsToExcel,
} from '../utils/spreadsheetExport.ts';

interface AdminDashboardPageProps {
  user: PanelUserProfile;
  activeSection: Extract<
    AdminNavSection,
    'inicio' | 'cadastros' | 'termos' | 'auditoria' | 'configuracoes'
  >;
  isDark: boolean;
  onToggleTheme: () => void;
  onSetDark: (next: boolean) => void;
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

const DEFAULT_VIEW_MODE_KEY = 'ameta_admin_default_list_view';

function readDefaultViewMode(): 'table' | 'cards' {
  if (typeof window === 'undefined') return 'table';
  return localStorage.getItem(DEFAULT_VIEW_MODE_KEY) === 'cards' ? 'cards' : 'table';
}

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

function writeStateToUrl(state: FilterState, enabled: boolean): void {
  if (!enabled) return;
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
      return 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info)]';
    case 'Em análise':
      return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning)]';
    case 'Dados conferidos':
      return 'border-[#229A9A]/40 bg-[#229A9A]/12 text-[#1b8181] dark:text-[#5eead4]';
    case 'Concluído':
      return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success)]';
    default:
      return 'border-[var(--border-default)] bg-[var(--surface-subtle)] text-[var(--text-secondary)]';
  }
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

export function AdminDashboardPage({
  user,
  activeSection,
  isDark,
  onToggleTheme,
  onSetDark,
  onLogout,
  onNavigate,
}: AdminDashboardPageProps) {
  const { showToast } = useToast();
  const initialState = useMemo(() => readStateFromUrl(), []);

  // Estado dos filtros da listagem de cadastros
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

  const [filtersOpen, setFiltersOpen] = useState<boolean>(() => {
    const st = readStateFromUrl();
    return Boolean(
      st.roles.length > 0 ||
        st.maritalStatus !== 'ALL' ||
        st.status !== 'ALL' ||
        st.dateFrom ||
        st.dateTo ||
        st.birthPlace ||
        st.nationality ||
        st.unseenOnly
    );
  });

  const [defaultViewMode, setDefaultViewMode] = useState<'table' | 'cards'>(() =>
    readDefaultViewMode()
  );
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => readDefaultViewMode());

  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const roleMenuRef = useRef<HTMLDivElement>(null);

  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const [quickTermRecord, setQuickTermRecord] =
    useState<ContractorRegistrationDetail | null>(null);
  const [termPickerOpen, setTermPickerOpen] = useState(false);
  const [termPickerSearch, setTermPickerSearch] = useState('');

  // Dados em tempo real
  const [allRecords, setAllRecords] = useState<ContractorRegistrationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCounter, setRetryCounter] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [newArrivalToast, setNewArrivalToast] = useState<{
    id: string;
    fullName: string;
    role: string;
  } | null>(null);

  // Termos gerados (para KPI mensal e aba Termos)
  const [allTerms, setAllTerms] = useState<DiscountTermHistoryItem[]>([]);
  const [expandedTermIds, setExpandedTermIds] = useState<Record<string, boolean>>({});
  const [loadingTerms, setLoadingTerms] = useState(false);
  const [termsSearch, setTermsSearch] = useState('');
  const [redownloadingKey, setRedownloadingKey] = useState<string | null>(null);

  // Auditoria global (somente admin na aba Auditoria)
  const [allAuditoria, setAllAuditoria] = useState<AuditLogItem[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');

  const knownIdsRef = useRef<Set<string> | null>(null);
  const pageSize = 15;

  // Sincronizar URL quando mudar para cadastros com query params
  useEffect(() => {
    if (activeSection === 'cadastros') {
      const next = readStateFromUrl();
      if (next.status !== 'ALL') setStatusFilter(next.status);
      if (next.search) {
        setSearch(next.search);
        setDebouncedSearch(next.search);
      }
      if (next.viewId) setFullscreenId(next.viewId);
    }
  }, [activeSection]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setDebouncedBirthPlace(birthPlace);
      setDebouncedNationality(nationality);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [search, birthPlace, nationality]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (roleMenuRef.current && !roleMenuRef.current.contains(event.target as Node)) {
        setRoleMenuOpen(false);
      }
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-row-menu]')) {
        setRowMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    writeStateToUrl(
      {
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
      },
      activeSection === 'cadastros'
    );
  }, [
    activeSection,
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

  // Listener principal de cadastros
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

  // Listener de termos (para Início e Termos gerados)
  useEffect(() => {
    if (activeSection !== 'inicio' && activeSection !== 'termos') return;
    setLoadingTerms(true);
    const unsubscribe = subscribeToAllTermos(
      (items) => {
        setAllTerms(items);
        setLoadingTerms(false);
      },
      () => {
        setLoadingTerms(false);
      }
    );
    return () => unsubscribe();
  }, [activeSection]);

  // Listener de auditoria (somente admin na seção Auditoria)
  useEffect(() => {
    if (activeSection !== 'auditoria' || user.role !== 'admin') return;
    setLoadingAudit(true);
    const unsubscribe = subscribeToAllAuditoria(
      (items) => {
        setAllAuditoria(items);
        setLoadingAudit(false);
      },
      () => {
        setLoadingAudit(false);
      }
    );
    return () => unsubscribe();
  }, [activeSection, user.role]);

  const newStatusCount = useMemo(
    () => allRecords.filter((item) => item.status === 'Novo').length,
    [allRecords]
  );

  const recentNewItems = useMemo(
    () => allRecords.filter((item) => item.status === 'Novo' || !item.viewed).slice(0, 6),
    [allRecords]
  );

  // KPIs para o Dashboard Início
  const kpiStats = useMemo(() => {
    const novos = allRecords.filter((r) => r.status === 'Novo').length;
    const emAnalise = allRecords.filter((r) => r.status === 'Em análise').length;
    const conferidos = allRecords.filter((r) => r.status === 'Dados conferidos').length;
    const concluidos = allRecords.filter((r) => r.status === 'Concluído').length;

    const currentMonthPrefix = getTodayISODate().slice(0, 7);
    const termosMes = allTerms.filter((t) =>
      (t.createdAt || '').slice(0, 7) === currentMonthPrefix
    ).length;

    return { novos, emAnalise, conferidos, concluidos, termosMes };
  }, [allRecords, allTerms]);

  // Dados dos gráficos (últimos 7 dias + distribuição por função)
  const last7DaysChart = useMemo(() => {
    const todayStr = getTodayISODate();
    const [y, m, d] = todayStr.split('-').map(Number);
    const baseUtc = new Date(Date.UTC(y, m - 1, d));
    const days: Array<{ iso: string; label: string; count: number }> = [];

    for (let i = 6; i >= 0; i--) {
      const dt = new Date(baseUtc);
      dt.setUTCDate(dt.getUTCDate() - i);
      const iso = dt.toISOString().slice(0, 10);
      const label = `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
      days.push({ iso, label, count: 0 });
    }

    const map = new Map(days.map((day) => [day.iso, day]));
    for (const rec of allRecords) {
      const key = (rec.registrationDate || rec.createdAt || '').slice(0, 10);
      const bucket = map.get(key);
      if (bucket) bucket.count += 1;
    }

    const maxCount = Math.max(1, ...days.map((day) => day.count));
    return { days, maxCount };
  }, [allRecords]);

  const roleDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const role of ROLE_OPTIONS) {
      counts.set(role, 0);
    }
    for (const rec of allRecords) {
      counts.set(rec.role, (counts.get(rec.role) || 0) + 1);
    }
    const entries = Array.from(counts.entries()).map(([role, count]) => ({
      role,
      count,
      percent: allRecords.length > 0 ? Math.round((count / allRecords.length) * 100) : 0,
    }));
    entries.sort((a, b) => b.count - a.count);
    return entries;
  }, [allRecords]);

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
      showToast(`Arquivo CSV exportado (${targetRecords.length} registro(s)).`);
    } else {
      exportRegistrationsToExcel(targetRecords);
      showToast(`Planilha Excel exportada (${targetRecords.length} registro(s)).`);
    }
  };

  const handleExportFilteredPdf = () => {
    const targetRecords = getExportTargetRecords();
    if (targetRecords.length === 0) return;
    setExportingPdf(true);
    try {
      exportFilteredListToPdf(targetRecords);
      showToast(`Relatório PDF gerado (${targetRecords.length} registro(s)).`);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleQuickCopy = async (item: ContractorRegistrationDetail) => {
    await copyText(formatRegistrationAsText(item));
    setRowMenuId(null);
    showToast(`Dados de ${item.fullName} copiados.`);
  };

  const handleQuickStatusChange = async (
    item: ContractorRegistrationDetail,
    nextStatus: RegistrationStatus
  ) => {
    setRowMenuId(null);
    if (item.status === nextStatus) return;
    try {
      await updateCadastroStatus(item.id, item.status, nextStatus, user);
      showToast(`Status de ${item.fullName} alterado para "${nextStatus}".`);
    } catch {
      showToast('Não foi possível atualizar o status.', 'error');
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

  // Filtragem da lista global de Termos
  const filteredTerms = useMemo(() => {
    const q = termsSearch.trim().toLowerCase();
    if (!q) return allTerms;
    return allTerms.filter(
      (t) =>
        t.contractorCompanyName.toLowerCase().includes(q) ||
        t.contractorCnpj.toLowerCase().includes(q) ||
        t.generatedByName.toLowerCase().includes(q) ||
        t.totalValueDisplay.toLowerCase().includes(q)
    );
  }, [allTerms, termsSearch]);

  // Filtragem de Auditoria
  const filteredAuditoria = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    if (!q) return allAuditoria;
    return allAuditoria.filter(
      (a) =>
        a.nome.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.acao.toLowerCase().includes(q) ||
        (a.detalhes?.resumo || '').toLowerCase().includes(q)
    );
  }, [allAuditoria, auditSearch]);

  const handleRedownloadTerm = async (term: DiscountTermHistoryItem, format: 'docx' | 'pdf') => {
    setRedownloadingKey(`${term.id}:${format}`);
    try {
      if (format === 'docx') {
        await exportDiscountTermToDocx(
          term.templateFields,
          term.contractorCompanyName,
          term.selectedDocuments
        );
      } else {
        exportDiscountTermToPdf(
          term.templateFields,
          term.contractorCompanyName,
          term.selectedDocuments
        );
      }
      if (term.registrationId) {
        await recordTermRedownloadAudit({
          cadastroId: term.registrationId,
          termoId: term.id,
          format,
          actor: user,
        }).catch(() => {});
      }
      showToast(
        format === 'docx'
          ? 'Termo em Word (.docx) baixado.'
          : 'Termo em PDF baixado.'
      );
    } finally {
      setRedownloadingKey(null);
    }
  };

  // Configura título, subtítulo e ações por seção
  const sectionMeta: Record<
    AdminDashboardPageProps['activeSection'],
    { title: string; subtitle: string; crumb: string }
  > = {
    inicio: {
      title: `Olá, ${user.nome.split(' ')[0]}`,
      subtitle: 'Visão geral em tempo real dos cadastros de prestadores e termos emitidos.',
      crumb: 'Início',
    },
    cadastros: {
      title: 'Cadastros Recebidos',
      subtitle: !loading
        ? `${total} ${total === 1 ? 'cadastro encontrado' : 'cadastros encontrados'}${
            selectedIds.length > 0 ? ` · ${selectedIds.length} selecionado(s)` : ''
          }`
        : 'Carregando cadastros em tempo real...',
      crumb: 'Cadastros',
    },
    termos: {
      title: 'Termos Gerados',
      subtitle: 'Histórico consolidado de todos os Termos de Autorização de Desconto gerados pela equipe.',
      crumb: 'Termos gerados',
    },
    auditoria: {
      title: 'Auditoria do Painel',
      subtitle: 'Registro cronológico de acessos, alterações de fichas e emissão de termos.',
      crumb: 'Auditoria',
    },
    configuracoes: {
      title: 'Configurações',
      subtitle: 'Preferências visuais da sua conta no painel administrativo Ameta.',
      crumb: 'Configurações',
    },
  };

  const currentMeta = sectionMeta[activeSection];

  const cadastrosHeaderActions =
    activeSection === 'cadastros' ? (
      <>
        <button
          type="button"
          onClick={() => handleExportSpreadsheet('csv')}
          disabled={loading || total === 0}
          className="ameta-btn-interactive inline-flex h-10 items-center gap-2 px-3.5 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
          <span>{selectedIds.length > 0 ? `CSV (${selectedIds.length})` : 'Exportar CSV'}</span>
        </button>

        <button
          type="button"
          onClick={handleExportFilteredPdf}
          disabled={loading || total === 0 || exportingPdf}
          className="ameta-btn-interactive inline-flex h-10 items-center gap-2 px-3.5 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          {exportingPdf ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-[#229A9A]" aria-hidden="true" />
          )}
          <span>
            {selectedIds.length > 0 ? `Exportar PDF (${selectedIds.length})` : 'Exportar PDF'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleExportSpreadsheet('xlsx')}
          disabled={loading || total === 0}
          className="ameta-btn-interactive inline-flex h-10 items-center gap-2 px-4 rounded-[10px] bg-[#1F2E85] hover:bg-[#2536A8] text-xs font-semibold text-white shadow-sm disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <FileSpreadsheet className="h-3.5 w-3.5 text-[#5eead4]" aria-hidden="true" />
          <span>
            {selectedIds.length > 0 ? `Exportar Excel (${selectedIds.length})` : 'Exportar Excel'}
          </span>
        </button>
      </>
    ) : undefined;

  const pickerMatches = useMemo(() => {
    const q = termPickerSearch.trim().toLowerCase();
    const list = q
      ? allRecords.filter(
          (r) =>
            r.fullName.toLowerCase().includes(q) ||
            r.cnpj.toLowerCase().includes(q) ||
            r.cpf.toLowerCase().includes(q)
        )
      : allRecords;
    return list.slice(0, 12);
  }, [allRecords, termPickerSearch]);

  return (
    <AdminLayout
      user={user}
      activeNav={activeSection}
      pageTitle={currentMeta.title}
      pageSubtitle={currentMeta.subtitle}
      breadcrumbs={
        activeSection === 'inicio'
          ? [{ label: 'Painel Ameta' }, { label: 'Início' }]
          : [{ label: 'Painel Ameta', path: '/admin' }, { label: currentMeta.crumb }]
      }
      headerActions={cadastrosHeaderActions}
      globalSearch={
        activeSection === 'cadastros'
          ? search
          : activeSection === 'termos'
            ? termsSearch
            : activeSection === 'auditoria'
              ? auditSearch
              : ''
      }
      onGlobalSearchChange={(val) => {
        if (activeSection === 'cadastros') {
          setSearch(val);
          setPage(1);
        } else if (activeSection === 'termos') {
          setTermsSearch(val);
        } else if (activeSection === 'auditoria') {
          setAuditSearch(val);
        }
      }}
      onGlobalSearchSubmit={(val) => {
        if (activeSection !== 'cadastros') {
          setSearch(val);
          setDebouncedSearch(val);
          setPage(1);
          onNavigate(`/admin/cadastros${val.trim() ? `?q=${encodeURIComponent(val.trim())}` : ''}`);
        }
      }}
      newCount={newStatusCount}
      recentNewItems={recentNewItems}
      onOpenRegistration={(id) => openFullscreen(id)}
      isDark={isDark}
      onToggleTheme={onToggleTheme}
      onLogout={onLogout}
      onNavigate={onNavigate}
    >
      {/* Aviso flutuante em tempo real quando chega novo cadastro */}
      {newArrivalToast && (
        <div
          role="status"
          className="mb-5 rounded-[12px] border border-[#229A9A]/40 bg-[#229A9A]/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3 animate-toast-in"
        >
          <div className="flex items-center gap-2.5 text-sm text-[var(--text-primary)]">
            <Bell className="h-4 w-4 text-[#229A9A] shrink-0" aria-hidden="true" />
            <span>
              Novo cadastro recebido: <strong>{newArrivalToast.fullName}</strong> (
              {newArrivalToast.role})
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
              className="ameta-btn-interactive inline-flex h-9 items-center px-3.5 rounded-[8px] bg-[#1F2E85] hover:bg-[#2536A8] text-white text-xs font-semibold"
            >
              Abrir ficha
            </button>
            <button
              type="button"
              onClick={() => setNewArrivalToast(null)}
              aria-label="Dispensar aviso"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* ==================== SEÇÃO: INÍCIO (DASHBOARD) ==================== */}
      {activeSection === 'inicio' && (
        <div className="space-y-6">
          {/* 5 KPI Cards animados */}
          <section
            aria-label="Indicadores principais"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
          >
            {[
              {
                label: 'Novos cadastros',
                value: kpiStats.novos,
                icon: Sparkles,
                accent: 'bg-[var(--status-info-bg)] text-[#1F2E85] dark:text-[#8fa2ff]',
                valueColor: 'text-[#1F2E85] dark:text-[#8fa2ff]',
                onClick: () => {
                  setStatusFilter('Novo');
                  setPage(1);
                  onNavigate('/admin/cadastros?status=Novo');
                },
              },
              {
                label: 'Em análise',
                value: kpiStats.emAnalise,
                icon: Clock,
                accent: 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]',
                valueColor: 'text-[var(--status-warning)]',
                onClick: () => {
                  setStatusFilter('Em análise');
                  setPage(1);
                  onNavigate('/admin/cadastros?status=Em%20an%C3%A1lise');
                },
              },
              {
                label: 'Dados conferidos',
                value: kpiStats.conferidos,
                icon: FileCheck2,
                accent: 'bg-[#229A9A]/15 text-[#229A9A]',
                valueColor: 'text-[#229A9A]',
                onClick: () => {
                  setStatusFilter('Dados conferidos');
                  setPage(1);
                  onNavigate('/admin/cadastros?status=Dados%20conferidos');
                },
              },
              {
                label: 'Concluídos',
                value: kpiStats.concluidos,
                icon: CheckCircle2,
                accent: 'bg-[var(--status-success-bg)] text-[var(--status-success)]',
                valueColor: 'text-[var(--status-success)]',
                onClick: () => {
                  setStatusFilter('Concluído');
                  setPage(1);
                  onNavigate('/admin/cadastros?status=Conclu%C3%ADdo');
                },
              },
              {
                label: 'Termos no mês',
                value: kpiStats.termosMes,
                icon: ScrollText,
                accent: 'bg-[#1F2E85]/10 text-[#1F2E85] dark:bg-[#229A9A]/20 dark:text-[#5eead4]',
                valueColor: 'text-[var(--text-primary)]',
                onClick: () => onNavigate('/admin/termos'),
              },
            ].map((kpi) => {
              const Icon = kpi.icon;
              return (
                <button
                  key={kpi.label}
                  type="button"
                  onClick={kpi.onClick}
                  className="ameta-btn-interactive text-left bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-5 shadow-[var(--shadow-card)] hover:border-[#229A9A]/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--text-secondary)]">
                      {kpi.label}
                    </span>
                    <span
                      className={`h-9 w-9 rounded-[10px] flex items-center justify-center shrink-0 ${kpi.accent}`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </div>
                  <p className={`mt-3 text-3xl font-bold tabular-nums ${kpi.valueColor}`}>
                    {loading ? '—' : <AnimatedCounter value={kpi.value} />}
                  </p>
                </button>
              );
            })}
          </section>

          {/* Atalhos rápidos */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => onNavigate('/admin/cadastros')}
              className="ameta-btn-interactive flex items-center justify-between gap-4 p-5 rounded-[12px] bg-[#1F2E85] hover:bg-[#2536A8] text-white shadow-[var(--shadow-card)] text-left"
            >
              <div>
                <p className="font-display text-base font-bold">Ver todos os cadastros</p>
                <p className="text-xs text-white/80 mt-0.5 tabular-nums">
                  {allRecords.length} registro(s) no total
                </p>
              </div>
              <span className="h-10 w-10 rounded-[10px] bg-white/15 flex items-center justify-center shrink-0">
                <ClipboardList className="h-5 w-5 text-[#5eead4]" aria-hidden="true" />
              </span>
            </button>

            <button
              type="button"
              disabled={allRecords.length === 0}
              onClick={() => setTermPickerOpen(true)}
              className="ameta-btn-interactive flex items-center justify-between gap-4 p-5 rounded-[12px] bg-[var(--surface-card)] border border-[var(--border-default)] hover:border-[#229A9A] text-[var(--text-primary)] shadow-[var(--shadow-card)] text-left disabled:opacity-50"
            >
              <div>
                <p className="font-display text-base font-bold">Gerar termo</p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Emitir autorização em PDF ou Word
                </p>
              </div>
              <span className="h-10 w-10 rounded-[10px] bg-[#229A9A]/15 text-[#229A9A] flex items-center justify-center shrink-0">
                <ScrollText className="h-5 w-5" aria-hidden="true" />
              </span>
            </button>

            <button
              type="button"
              disabled={allRecords.length === 0}
              onClick={() => {
                exportRegistrationsToExcel(allRecords);
                showToast(`Planilha Excel exportada (${allRecords.length} registro(s)).`);
              }}
              className="ameta-btn-interactive flex items-center justify-between gap-4 p-5 rounded-[12px] bg-[var(--surface-card)] border border-[var(--border-default)] hover:border-[#1F2E85] text-[var(--text-primary)] shadow-[var(--shadow-card)] text-left disabled:opacity-50"
            >
              <div>
                <p className="font-display text-base font-bold">Exportar</p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Baixar planilha Excel completa (.xlsx)
                </p>
              </div>
              <span className="h-10 w-10 rounded-[10px] bg-[var(--status-info-bg)] text-[#1F2E85] dark:text-[#8fa2ff] flex items-center justify-center shrink-0">
                <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
              </span>
            </button>
          </section>

          {/* Gráficos SVG com cores da marca + Últimos cadastros */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Gráfico 1: Cadastros nos últimos 7 dias */}
            <section className="lg:col-span-7 bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-5 sm:p-6 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between gap-2 mb-5">
                <div>
                  <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                    Cadastros por período
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Entradas nos últimos 7 dias
                  </p>
                </div>
                <span className="text-xs font-semibold text-[#229A9A] tabular-nums">
                  {last7DaysChart.days.reduce((acc, d) => acc + d.count, 0)} recente(s)
                </span>
              </div>

              <div className="w-full overflow-x-auto">
                <svg
                  viewBox="0 0 560 190"
                  role="img"
                  aria-label="Gráfico de cadastros nos últimos 7 dias"
                  className="w-full h-48 min-w-[380px]"
                >
                  <defs>
                    <linearGradient id="ametaBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#229A9A" />
                      <stop offset="100%" stopColor="#1F2E85" />
                    </linearGradient>
                  </defs>
                  {[0.25, 0.5, 0.75, 1].map((ratio) => {
                    const y = 148 - ratio * 116;
                    return (
                      <line
                        key={ratio}
                        x1="20"
                        y1={y}
                        x2="540"
                        y2={y}
                        stroke="currentColor"
                        className="text-[var(--border-default)]"
                        strokeDasharray="3 3"
                      />
                    );
                  })}
                  {last7DaysChart.days.map((day, idx) => {
                    const slotWidth = 520 / 7;
                    const barWidth = 34;
                    const x = 20 + idx * slotWidth + (slotWidth - barWidth) / 2;
                    const barHeight = Math.max(
                      day.count > 0 ? 12 : 4,
                      Math.round((day.count / last7DaysChart.maxCount) * 114)
                    );
                    const y = 148 - barHeight;
                    return (
                      <g key={day.iso}>
                        <rect
                          x={x}
                          y={y}
                          width={barWidth}
                          height={barHeight}
                          rx="6"
                          fill={day.count > 0 ? 'url(#ametaBarGrad)' : 'var(--border-default)'}
                        />
                        <text
                          x={x + barWidth / 2}
                          y={y - 7}
                          textAnchor="middle"
                          className="fill-[var(--text-primary)] text-[11px] font-bold tabular-nums"
                        >
                          {day.count}
                        </text>
                        <text
                          x={x + barWidth / 2}
                          y={170}
                          textAnchor="middle"
                          className="fill-[var(--text-muted)] text-[11px] font-medium tabular-nums"
                        >
                          {day.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </section>

            {/* Gráfico 2: Distribuição por função */}
            <section className="lg:col-span-5 bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-5 sm:p-6 shadow-[var(--shadow-card)]">
              <div className="mb-5">
                <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                  Distribuição por função
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Participação de cada especialidade
                </p>
              </div>

              <div className="space-y-4">
                {roleDistribution.map((item, idx) => {
                  const barColors = [
                    'bg-[#1F2E85]',
                    'bg-[#229A9A]',
                    'bg-[#2536A8]',
                    'bg-[#1E9E6A]',
                  ];
                  return (
                    <div key={item.role} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[var(--text-primary)] truncate">
                          {item.role}
                        </span>
                        <span className="text-[var(--text-secondary)] tabular-nums shrink-0">
                          <strong className="text-[var(--text-primary)]">{item.count}</strong> (
                          {item.percent}%)
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-[var(--surface-subtle)] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            barColors[idx % barColors.length]
                          }`}
                          style={{ width: `${Math.max(item.count > 0 ? 4 : 0, item.percent)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Lista clicável de últimos cadastros */}
          <section className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] overflow-hidden shadow-[var(--shadow-card)]">
            <div className="px-5 py-4 border-b border-[var(--border-default)] flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                  Últimos cadastros
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Clique em um registro para abrir a ficha completa
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/admin/cadastros')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand-royal)] dark:text-[#8fa2ff] hover:underline"
              >
                <span>Ver lista completa</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            {loading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-14 rounded-[10px] bg-[var(--surface-subtle)] animate-pulse"
                  />
                ))}
              </div>
            ) : allRecords.length === 0 ? (
              <div className="p-10 text-center text-sm text-[var(--text-muted)]">
                Nenhum cadastro recebido até o momento.
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border-default)]">
                {allRecords.slice(0, 6).map((item) => {
                  const isUnseen = !item.viewed;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => openFullscreen(item.id)}
                        className="w-full px-5 py-3.5 text-left hover:bg-[var(--surface-hover)] transition-colors flex flex-wrap sm:flex-nowrap items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-sm text-[var(--text-primary)] truncate ${
                                isUnseen ? 'font-bold' : 'font-semibold'
                              }`}
                            >
                              {item.fullName}
                            </span>
                            {isUnseen && (
                              <span className="px-2 py-0.5 rounded-[6px] bg-[#229A9A] text-white text-[10.5px] font-bold">
                                Novo
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                            {item.role} · CPF{' '}
                            <span className="font-mono tabular-nums">
                              {maskCPFForList(item.cpf)}
                            </span>
                          </p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-[6px] border text-[11px] font-semibold ${getStatusBadgeClasses(
                              item.status
                            )}`}
                          >
                            {item.status}
                          </span>
                          <span className="text-xs tabular-nums text-[var(--text-muted)]">
                            {formatDateBR(item.registrationDate)}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* ==================== SEÇÃO: CADASTROS ==================== */}
      {activeSection === 'cadastros' && (
        <div className="space-y-5">
          {/* Barra superior da listagem: contador Novos + toggle filtros + toggle Tabela/Cartões */}
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-4 sm:p-5 shadow-[var(--shadow-card)] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
                <div className="relative flex-1 min-w-[220px] max-w-md">
                  <Search
                    className="h-4 w-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
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
                    aria-label="Busca geral de cadastros"
                    className="w-full h-11 pl-10 pr-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand-royal)] focus:ring-2 focus:ring-[var(--brand-royal)]/15"
                  />
                </div>

                {!loading && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter(statusFilter === 'Novo' ? 'ALL' : 'Novo');
                      setPage(1);
                    }}
                    className={`inline-flex h-11 items-center gap-2 px-3.5 rounded-[10px] border text-xs font-semibold transition-colors tabular-nums ${
                      statusFilter === 'Novo'
                        ? 'border-[#229A9A] bg-[#229A9A] text-white'
                        : 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info)] hover:opacity-90'
                    }`}
                  >
                    <span>Novos: {newStatusCount}</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setFiltersOpen((prev) => !prev)}
                  aria-expanded={filtersOpen}
                  className={`ameta-btn-interactive inline-flex h-11 items-center gap-2 px-3.5 rounded-[10px] border text-xs font-semibold whitespace-nowrap ${
                    filtersOpen || hasActiveFilters
                      ? 'border-[#1F2E85] bg-[var(--status-info-bg)] text-[#1F2E85] dark:text-[#8fa2ff]'
                      : 'border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Filtros</span>
                  {activeFilterChips.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-[5px] bg-[#1F2E85] text-white text-[10.5px] font-bold tabular-nums">
                      {activeFilterChips.length}
                    </span>
                  )}
                </button>

                {/* Alternância Tabela / Cartões */}
                <div
                  role="group"
                  aria-label="Modo de visualização"
                  className="inline-flex rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-bg)] p-1"
                >
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    aria-pressed={viewMode === 'table'}
                    className={`inline-flex h-9 items-center gap-1.5 px-3 rounded-[7px] text-xs font-semibold transition-colors ${
                      viewMode === 'table'
                        ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <LayoutList className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Tabela</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('cards')}
                    aria-pressed={viewMode === 'cards'}
                    className={`inline-flex h-9 items-center gap-1.5 px-3 rounded-[7px] text-xs font-semibold transition-colors ${
                      viewMode === 'cards'
                        ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Cartões</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Painel retrátil de filtros detalhados */}
            {filtersOpen && (
              <div className="pt-4 border-t border-[var(--border-default)] space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
                  {/* Seleção múltipla de Função */}
                  <div className="lg:col-span-4 relative" ref={roleMenuRef}>
                    <span className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      Função
                    </span>
                    <button
                      type="button"
                      aria-expanded={roleMenuOpen}
                      onClick={() => setRoleMenuOpen((prev) => !prev)}
                      className="w-full h-10 px-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-sm text-left text-[var(--text-primary)] flex items-center justify-between gap-2"
                    >
                      <span className="truncate">
                        {selectedRoles.length === 0
                          ? 'Todas as funções'
                          : selectedRoles.length === 1
                            ? selectedRoles[0]
                            : `${selectedRoles.length} funções selecionadas`}
                      </span>
                      <ChevronDown
                        className="h-4 w-4 text-[var(--text-muted)] shrink-0"
                        aria-hidden="true"
                      />
                    </button>

                    {roleMenuOpen && (
                      <div className="absolute left-0 right-0 mt-1.5 z-30 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] shadow-[var(--shadow-elevated)] p-2 space-y-1">
                        {ROLE_OPTIONS.map((role) => {
                          const checked = selectedRoles.includes(role);
                          return (
                            <label
                              key={role}
                              className="flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] hover:bg-[var(--surface-hover)] cursor-pointer text-sm text-[var(--text-primary)]"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleRoleFilter(role)}
                                className="h-4 w-4 rounded border-[var(--border-strong)] accent-[#1F2E85]"
                              />
                              <span>{role}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="lg:col-span-3">
                    <label
                      htmlFor="filter-marital-status"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
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
                      className="w-full h-10 px-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-sm text-[var(--text-primary)]"
                    >
                      <option value="ALL">Todos</option>
                      {MARITAL_STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="lg:col-span-3">
                    <label
                      htmlFor="filter-status"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
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
                      className="w-full h-10 px-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-sm text-[var(--text-primary)]"
                    >
                      <option value="ALL">Todos os status</option>
                      {REGISTRATION_STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="lg:col-span-2">
                    <label
                      htmlFor="sort-select"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
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
                      className="w-full h-10 px-2.5 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-xs font-medium text-[var(--text-primary)]"
                    >
                      <option value="registrationDate:desc">Mais recente</option>
                      <option value="registrationDate:asc">Mais antiga</option>
                      <option value="fullName:asc">Nome (A–Z)</option>
                      <option value="fullName:desc">Nome (Z–A)</option>
                      <option value="status:asc">Status</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
                  <div className="lg:col-span-2">
                    <label
                      htmlFor="filter-date-from"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
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
                      className="w-full h-10 px-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-sm tabular-nums text-[var(--text-primary)]"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label
                      htmlFor="filter-date-to"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
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
                      className="w-full h-10 px-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-sm tabular-nums text-[var(--text-primary)]"
                    />
                  </div>

                  <div className="sm:col-span-2 lg:col-span-4">
                    <span className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      Atalhos de período
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { id: 'today', label: 'Hoje' },
                          { id: '7d', label: 'Últimos 7 dias' },
                          { id: '30d', label: 'Últimos 30 dias' },
                          { id: 'month', label: 'Este mês' },
                        ] as const
                      ).map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => applyDatePreset(preset.id)}
                          className="h-10 px-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="lg:col-span-2">
                    <label
                      htmlFor="filter-birthplace"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
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
                      className="w-full h-10 px-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label
                      htmlFor="filter-nationality"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
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
                      className="w-full h-10 px-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                    />
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-[var(--text-primary)] select-none">
                    <input
                      type="checkbox"
                      checked={unseenOnly}
                      onChange={(e) => {
                        setUnseenOnly(e.target.checked);
                        setPage(1);
                      }}
                      className="h-4 w-4 rounded border-[var(--border-strong)] accent-[#1F2E85]"
                    />
                    <span>Apenas não vistos</span>
                  </label>

                  {selectedIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedIds([])}
                      className="text-xs font-semibold text-[var(--brand-royal)] dark:text-[#8fa2ff] hover:underline"
                    >
                      Limpar seleção ({selectedIds.length})
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Chips de filtros ativos */}
            {hasActiveFilters && (
              <div className="pt-3 border-t border-[var(--border-default)] flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-muted)] mr-1">
                  <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Filtros ativos:</span>
                </span>
                {activeFilterChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.onRemove}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[7px] border border-[var(--border-default)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] text-xs font-medium text-[var(--text-primary)] transition-colors"
                  >
                    <span>{chip.label}</span>
                    <X className="h-3 w-3 text-[var(--text-muted)]" aria-hidden="true" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-xs font-semibold text-[var(--brand-royal)] dark:text-[#8fa2ff] hover:underline ml-1"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  <span>Limpar filtros</span>
                </button>
              </div>
            )}
          </div>

          {/* Lista (Tabela ou Cartões) */}
          <section className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] overflow-hidden shadow-[var(--shadow-card)]">
            {error ? (
              <div className="p-8 text-center">
                <p className="text-sm text-[var(--status-error)]">{error}</p>
                <button
                  type="button"
                  onClick={() => setRetryCounter((c) => c + 1)}
                  className="mt-3 inline-flex h-10 items-center px-4 rounded-[10px] bg-[#1F2E85] text-white text-xs font-semibold"
                >
                  Tentar novamente
                </button>
              </div>
            ) : loading ? (
              <div className="divide-y divide-[var(--border-default)]">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div key={idx} className="px-4 py-4 flex items-center gap-4 animate-pulse">
                    <div className="h-4 w-4 rounded bg-[var(--surface-subtle)]" />
                    <div className="h-4 w-52 rounded bg-[var(--surface-subtle)]" />
                    <div className="h-4 w-36 rounded bg-[var(--surface-subtle)] hidden md:block" />
                    <div className="h-4 w-28 rounded bg-[var(--surface-subtle)] hidden lg:block" />
                    <div className="ml-auto h-8 w-24 rounded bg-[var(--surface-subtle)]" />
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="p-12 text-center max-w-md mx-auto">
                <svg
                  viewBox="0 0 120 90"
                  aria-hidden="true"
                  className="w-24 h-20 mx-auto mb-4 text-[#229A9A]"
                >
                  <rect
                    x="22"
                    y="12"
                    width="54"
                    height="66"
                    rx="8"
                    fill="var(--surface-subtle)"
                    stroke="var(--border-strong)"
                    strokeWidth="2"
                  />
                  <line
                    x1="34"
                    y1="30"
                    x2="64"
                    y2="30"
                    stroke="var(--border-strong)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <line
                    x1="34"
                    y1="42"
                    x2="58"
                    y2="42"
                    stroke="var(--border-strong)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <polygon points="84,34 98,48 84,62 70,48" fill="#1F2E85" opacity="0.9" />
                  <polygon points="94,40 106,52 94,64 82,52" fill="#229A9A" opacity="0.9" />
                </svg>
                <p className="font-display text-base font-bold text-[var(--text-primary)]">
                  Nenhum cadastro encontrado
                </p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {hasActiveFilters
                    ? 'Nenhum prestador corresponde aos filtros selecionados.'
                    : 'Quando prestadores enviarem o formulário público, os registros aparecerão aqui em tempo real.'}
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="ameta-btn-interactive mt-4 inline-flex h-10 items-center gap-1.5 px-4 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Limpar filtros</span>
                  </button>
                )}
              </div>
            ) : viewMode === 'table' ? (
              <div className="overflow-x-auto max-h-[68vh]">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-[var(--surface-subtle)] border-b border-[var(--border-default)] text-[12px] font-semibold text-[var(--text-secondary)]">
                    <tr>
                      <th className="py-3.5 pl-4 pr-2 w-10">
                        <input
                          type="checkbox"
                          checked={allOnPageSelected}
                          onChange={toggleSelectAllOnPage}
                          aria-label="Selecionar todos nesta página"
                          className="h-4 w-4 rounded border-[var(--border-strong)] accent-[#1F2E85]"
                        />
                      </th>
                      <th className="py-3.5 px-3 whitespace-nowrap">Nome Completo</th>
                      <th className="py-3.5 px-3 whitespace-nowrap">Função</th>
                      <th className="py-3.5 px-3 whitespace-nowrap">Data</th>
                      <th className="py-3.5 px-3 whitespace-nowrap">Status</th>
                      <th className="py-3.5 px-3 whitespace-nowrap">CPF</th>
                      <th className="py-3.5 px-3 whitespace-nowrap">RG</th>
                      <th className="py-3.5 pl-3 pr-4 text-right whitespace-nowrap">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-default)] text-[13px]">
                    {items.map((item) => {
                      const isChecked = selectedIds.includes(item.id);
                      const isUnseen = !item.viewed;
                      const isMenuOpen = rowMenuId === item.id;
                      return (
                        <tr
                          key={item.id}
                          className="group hover:bg-[var(--surface-hover)] transition-colors"
                        >
                          <td className="py-3 pl-4 pr-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleRowSelection(item.id)}
                              aria-label={`Selecionar ${item.fullName}`}
                              className="h-4 w-4 rounded border-[var(--border-strong)] accent-[#1F2E85]"
                            />
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openFullscreen(item.id)}
                              className={`text-left hover:text-[var(--brand-royal)] dark:hover:text-[#8fa2ff] hover:underline text-[var(--text-primary)] ${
                                isUnseen ? 'font-bold' : 'font-medium'
                              }`}
                            >
                              {item.fullName}
                            </button>
                            {isUnseen && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-[5px] bg-[#229A9A] text-white text-[10px] font-bold">
                                Novo
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-[var(--text-secondary)] whitespace-nowrap">
                            {item.role}
                          </td>
                          <td className="py-3 px-3 tabular-nums text-[var(--text-secondary)] whitespace-nowrap">
                            {formatDateBR(item.registrationDate)}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-[6px] border text-[11px] font-semibold ${getStatusBadgeClasses(
                                item.status
                              )}`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-xs tabular-nums text-[var(--text-secondary)] whitespace-nowrap">
                            {maskCPFForList(item.cpf)}
                          </td>
                          <td className="py-3 px-3 font-mono text-xs tabular-nums text-[var(--text-secondary)] whitespace-nowrap">
                            {maskRGForList(item.rg)}
                          </td>
                          <td className="py-3 pl-3 pr-4 text-right whitespace-nowrap">
                            <div
                              data-row-menu
                              className="relative inline-flex items-center justify-end gap-1.5"
                            >
                              <button
                                type="button"
                                onClick={() => void handleQuickCopy(item)}
                                title="Copiar dados"
                                aria-label={`Copiar dados de ${item.fullName}`}
                                className="opacity-0 group-hover:opacity-100 focus:opacity-100 inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-opacity"
                              >
                                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setQuickTermRecord(item)}
                                title="Gerar termo"
                                aria-label={`Gerar termo para ${item.fullName}`}
                                className="opacity-0 group-hover:opacity-100 focus:opacity-100 inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] text-[#229A9A] hover:bg-[var(--surface-hover)] transition-opacity"
                              >
                                <ScrollText className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openFullscreen(item.id)}
                                className="inline-flex h-8 items-center px-3 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap"
                              >
                                Abrir ficha
                              </button>
                              <button
                                type="button"
                                aria-label={`Mais ações para ${item.fullName}`}
                                aria-expanded={isMenuOpen}
                                onClick={() =>
                                  setRowMenuId((prev) => (prev === item.id ? null : item.id))
                                }
                                className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                              >
                                <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>

                              {isMenuOpen && (
                                <div className="absolute right-0 top-9 z-30 w-52 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] shadow-[var(--shadow-elevated)] p-1.5 text-left">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRowMenuId(null);
                                      openFullscreen(item.id);
                                    }}
                                    className="w-full px-3 h-9 rounded-[7px] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] flex items-center gap-2"
                                  >
                                    <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>Abrir ficha</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleQuickCopy(item)}
                                    className="w-full px-3 h-9 rounded-[7px] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] flex items-center gap-2"
                                  >
                                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>Copiar dados</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRowMenuId(null);
                                      setQuickTermRecord(item);
                                    }}
                                    className="w-full px-3 h-9 rounded-[7px] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] flex items-center gap-2"
                                  >
                                    <ScrollText className="h-3.5 w-3.5 text-[#229A9A]" aria-hidden="true" />
                                    <span>Gerar termo</span>
                                  </button>
                                  <div className="my-1 border-t border-[var(--border-default)]" />
                                  <p className="px-3 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                                    Mudar status
                                  </p>
                                  {REGISTRATION_STATUS_OPTIONS.map((st) => (
                                    <button
                                      key={st}
                                      type="button"
                                      onClick={() => void handleQuickStatusChange(item, st)}
                                      className={`w-full px-3 h-8 rounded-[7px] text-xs flex items-center justify-between hover:bg-[var(--surface-hover)] ${
                                        item.status === st
                                          ? 'font-bold text-[#229A9A]'
                                          : 'text-[var(--text-secondary)]'
                                      }`}
                                    >
                                      <span>{st}</span>
                                      {item.status === st && <span>•</span>}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Visualização em Cartões */
              <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {items.map((item) => {
                  const isChecked = selectedIds.includes(item.id);
                  const isUnseen = !item.viewed;
                  return (
                    <article
                      key={item.id}
                      className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-bg)] p-4 flex flex-col justify-between gap-4 hover:border-[#229A9A]/60 transition-colors"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <label className="inline-flex items-start gap-2.5 cursor-pointer min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleRowSelection(item.id)}
                              aria-label={`Selecionar ${item.fullName}`}
                              className="mt-1 h-4 w-4 rounded border-[var(--border-strong)] accent-[#1F2E85]"
                            />
                            <span className="min-w-0">
                              <span
                                className={`block text-sm text-[var(--text-primary)] truncate ${
                                  isUnseen ? 'font-bold' : 'font-semibold'
                                }`}
                              >
                                {item.fullName}
                              </span>
                              <span className="block text-xs text-[#229A9A] font-medium">
                                {item.role}
                              </span>
                            </span>
                          </label>
                          {isUnseen && (
                            <span className="px-2 py-0.5 rounded-[6px] bg-[#229A9A] text-white text-[10.5px] font-bold shrink-0">
                              Novo
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-[6px] border text-[11px] font-semibold ${getStatusBadgeClasses(
                              item.status
                            )}`}
                          >
                            {item.status}
                          </span>
                          <span className="tabular-nums">
                            {formatDateBR(item.registrationDate)}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                          <div className="rounded-[8px] bg-[var(--surface-card)] border border-[var(--border-default)] px-2.5 py-1.5">
                            <span className="block text-[10px] text-[var(--text-muted)]">CPF</span>
                            <span className="font-mono tabular-nums text-[var(--text-primary)]">
                              {maskCPFForList(item.cpf)}
                            </span>
                          </div>
                          <div className="rounded-[8px] bg-[var(--surface-card)] border border-[var(--border-default)] px-2.5 py-1.5">
                            <span className="block text-[10px] text-[var(--text-muted)]">RG</span>
                            <span className="font-mono tabular-nums text-[var(--text-primary)]">
                              {maskRGForList(item.rg)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[var(--border-default)] flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleQuickCopy(item)}
                            title="Copiar dados"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          >
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuickTermRecord(item)}
                            title="Gerar termo"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] text-[#229A9A] hover:bg-[var(--surface-hover)]"
                          >
                            <ScrollText className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => openFullscreen(item.id)}
                          className="ameta-btn-interactive inline-flex h-9 items-center px-3.5 rounded-[8px] bg-[#1F2E85] hover:bg-[#2536A8] text-xs font-semibold text-white"
                        >
                          Abrir ficha
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {totalPages > 1 && (
              <div className="px-4 sm:px-5 py-3.5 border-t border-[var(--border-default)] flex items-center justify-between gap-4 text-xs text-[var(--text-secondary)]">
                <span className="tabular-nums font-medium">
                  Página {safePage} de {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex h-9 items-center gap-1 px-3 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] disabled:opacity-40 hover:bg-[var(--surface-hover)] transition-colors"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Anterior</span>
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex h-9 items-center gap-1 px-3 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] disabled:opacity-40 hover:bg-[var(--surface-hover)] transition-colors"
                  >
                    <span>Próxima</span>
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ==================== SEÇÃO: TERMOS GERADOS ==================== */}
      {activeSection === 'termos' && (
        <div className="space-y-5">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-4 flex flex-wrap items-center justify-between gap-3 shadow-[var(--shadow-card)]">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search
                className="h-4 w-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={termsSearch}
                onChange={(e) => setTermsSearch(e.target.value)}
                placeholder="Buscar por razão social, CNPJ, responsável ou valor..."
                aria-label="Buscar termos gerados"
                className="w-full h-11 pl-10 pr-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand-royal)]"
              />
            </div>

            <button
              type="button"
              disabled={allRecords.length === 0}
              onClick={() => setTermPickerOpen(true)}
              className="ameta-btn-interactive inline-flex h-11 items-center gap-2 px-4 rounded-[10px] bg-[#1F2E85] hover:bg-[#2536A8] text-xs font-semibold text-white disabled:opacity-50"
            >
              <ScrollText className="h-4 w-4 text-[#5eead4]" aria-hidden="true" />
              <span>Gerar novo termo</span>
            </button>
          </div>

          <section className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] overflow-hidden shadow-[var(--shadow-card)]">
            {loadingTerms ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-14 rounded-[10px] bg-[var(--surface-subtle)] animate-pulse"
                  />
                ))}
              </div>
            ) : filteredTerms.length === 0 ? (
              <div className="p-12 text-center">
                <ScrollText
                  className="h-9 w-9 text-[#229A9A] mx-auto mb-3 opacity-80"
                  aria-hidden="true"
                />
                <p className="font-display text-base font-bold text-[var(--text-primary)]">
                  Nenhum termo encontrado
                </p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Gere um novo Termo de Autorização de Desconto a partir de qualquer cadastro.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border-default)]">
                {filteredTerms.map((term) => {
                  const isDocxLoading = redownloadingKey === `${term.id}:docx`;
                  const isPdfLoading = redownloadingKey === `${term.id}:pdf`;
                  const docsList = term.selectedDocuments ?? [];
                  const isDocsExpanded = Boolean(expandedTermIds[term.id]);

                  return (
                    <li
                      key={term.id}
                      className="p-4 sm:px-6 space-y-2.5 hover:bg-[var(--surface-hover)] transition-colors"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
                              {term.totalValueDisplay
                                ? `R$ ${term.totalValueDisplay}`
                                : 'Valor em branco'}
                            </span>
                            <span className="px-2 py-0.5 rounded-[6px] bg-[var(--surface-subtle)] text-[11px] font-semibold text-[var(--text-secondary)]">
                              {term.paymentMode === 'integral'
                                ? 'Nota única'
                                : term.paymentMode === 'parcelado'
                                  ? `${term.installmentsCount || '—'}x`
                                  : 'Manual'}
                            </span>
                            {docsList.length > 0 && (
                              <button
                                type="button"
                                aria-expanded={isDocsExpanded}
                                onClick={() =>
                                  setExpandedTermIds((prev) => ({
                                    ...prev,
                                    [term.id]: !prev[term.id],
                                  }))
                                }
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] border border-[#229A9A]/35 bg-[#229A9A]/10 text-[11px] font-semibold text-[#1b8181] dark:text-[#5eead4] hover:bg-[#229A9A]/20 transition-colors tabular-nums"
                              >
                                <span>{docsList.length} documento(s)</span>
                                <ChevronDown
                                  className={`h-3 w-3 transition-transform ${
                                    isDocsExpanded ? 'rotate-180' : ''
                                  }`}
                                  aria-hidden="true"
                                />
                              </button>
                            )}
                            {term.contractorCompanyName && (
                              <span className="text-xs font-semibold text-[#1F2E85] dark:text-[#8fa2ff] truncate">
                                {term.contractorCompanyName}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--text-secondary)] flex flex-wrap items-center gap-2">
                            {term.contractorCnpj && (
                              <span className="font-mono tabular-nums">{term.contractorCnpj}</span>
                            )}
                            <span>
                              Gerado por <strong>{term.generatedByName}</strong>
                            </span>
                            <span className="tabular-nums">
                              · {formatDateTimeBR(term.createdAt)}
                            </span>
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {term.registrationId && (
                            <button
                              type="button"
                              onClick={() => openFullscreen(term.registrationId)}
                              className="inline-flex h-9 items-center px-3 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                            >
                              Abrir ficha
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={redownloadingKey !== null}
                            onClick={() => void handleRedownloadTerm(term, 'docx')}
                            className="inline-flex h-9 items-center gap-1.5 px-3 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
                          >
                            {isDocxLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Download className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            <span>Word (.docx)</span>
                          </button>
                          <button
                            type="button"
                            disabled={redownloadingKey !== null}
                            onClick={() => void handleRedownloadTerm(term, 'pdf')}
                            className="inline-flex h-9 items-center gap-1.5 px-3 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
                          >
                            {isPdfLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            <span>PDF</span>
                          </button>
                        </div>
                      </div>

                      {isDocsExpanded && docsList.length > 0 && (
                        <div className="rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-subtle)] px-4 py-2.5">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                            Documentos incluídos na Cláusula Primeira
                          </p>
                          <ul className="list-disc pl-5 space-y-1 text-xs text-[var(--text-secondary)]">
                            {docsList.map((docLabel, idx) => (
                              <li key={`${term.id}-all-doc-${idx}`}>{docLabel}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* ==================== SEÇÃO: AUDITORIA (SOMENTE ADMIN) ==================== */}
      {activeSection === 'auditoria' && (
        <div className="space-y-5">
          {user.role !== 'admin' ? (
            <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-10 text-center">
              <ShieldCheck
                className="h-10 w-10 text-[var(--status-error)] mx-auto mb-3"
                aria-hidden="true"
              />
              <p className="font-display text-base font-bold text-[var(--text-primary)]">
                Acesso restrito a administradores
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Apenas administradores podem consultar os registros de auditoria.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-4 shadow-[var(--shadow-card)]">
                <div className="relative max-w-md">
                  <Search
                    className="h-4 w-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Buscar por usuário, e-mail ou ação..."
                    aria-label="Filtrar eventos de auditoria"
                    className="w-full h-11 pl-10 pr-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand-royal)]"
                  />
                </div>
              </div>

              <section className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] overflow-hidden shadow-[var(--shadow-card)]">
                {loadingAudit ? (
                  <div className="p-6 space-y-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-12 rounded-[10px] bg-[var(--surface-subtle)] animate-pulse"
                      />
                    ))}
                  </div>
                ) : filteredAuditoria.length === 0 ? (
                  <div className="p-10 text-center text-sm text-[var(--text-muted)]">
                    Nenhum registro de auditoria encontrado.
                  </div>
                ) : (
                  <ul className="divide-y divide-[var(--border-default)]">
                    {filteredAuditoria.map((log) => (
                      <li
                        key={log.id}
                        className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[var(--surface-hover)] transition-colors"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded-[5px] bg-[var(--status-info-bg)] text-[var(--status-info)] text-[10.5px] font-bold">
                              {log.acao}
                            </span>
                            <span className="text-xs font-semibold text-[var(--text-primary)]">
                              {log.nome}
                            </span>
                            <span className="text-xs text-[var(--text-muted)]">({log.email})</span>
                          </div>
                          {log.detalhes?.resumo && (
                            <p className="text-xs text-[var(--text-secondary)]">
                              {log.detalhes.resumo}
                            </p>
                          )}
                          {log.detalhes?.statusAnterior && log.detalhes?.statusNovo && (
                            <p className="text-xs text-[var(--text-secondary)]">
                              Status: {log.detalhes.statusAnterior} → {log.detalhes.statusNovo}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {log.cadastroId && (
                            <button
                              type="button"
                              onClick={() => openFullscreen(log.cadastroId!)}
                              className="text-xs font-semibold text-[var(--brand-royal)] dark:text-[#8fa2ff] hover:underline"
                            >
                              Abrir ficha
                            </button>
                          )}
                          <span className="text-xs tabular-nums text-[var(--text-muted)]">
                            {formatDateTimeBR(log.criadoEm)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      )}

      {/* ==================== SEÇÃO: CONFIGURAÇÕES ==================== */}
      {activeSection === 'configuracoes' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-6 shadow-[var(--shadow-card)] space-y-5">
            <div>
              <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                Aparência e Visualização
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Ajuste o tema de cores e o formato padrão da lista de cadastros.
              </p>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-semibold text-[var(--text-primary)]">
                Tema do painel administrativo
              </span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => onSetDark(false)}
                  className={`h-12 px-4 rounded-[10px] border flex items-center gap-2.5 text-xs font-semibold transition-colors ${
                    !isDark
                      ? 'border-[#1F2E85] bg-[var(--status-info-bg)] text-[#1F2E85]'
                      : 'border-[var(--border-default)] bg-[var(--surface-bg)] text-[var(--text-secondary)]'
                  }`}
                >
                  <Sun className="h-4 w-4" aria-hidden="true" />
                  <span>Tema Claro</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSetDark(true)}
                  className={`h-12 px-4 rounded-[10px] border flex items-center gap-2.5 text-xs font-semibold transition-colors ${
                    isDark
                      ? 'border-[#229A9A] bg-[#229A9A]/15 text-[#5eead4]'
                      : 'border-[var(--border-default)] bg-[var(--surface-bg)] text-[var(--text-secondary)]'
                  }`}
                >
                  <Moon className="h-4 w-4" aria-hidden="true" />
                  <span>Tema Escuro</span>
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-[var(--border-default)]">
              <span className="block text-xs font-semibold text-[var(--text-primary)]">
                Exibição padrão em Cadastros
              </span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem(DEFAULT_VIEW_MODE_KEY, 'table');
                    setDefaultViewMode('table');
                    setViewMode('table');
                    showToast('Visualização padrão definida para Tabela.');
                  }}
                  className={`h-12 px-4 rounded-[10px] border flex items-center gap-2.5 text-xs font-semibold transition-colors ${
                    defaultViewMode === 'table'
                      ? 'border-[#1F2E85] bg-[var(--status-info-bg)] text-[#1F2E85] dark:text-[#8fa2ff]'
                      : 'border-[var(--border-default)] bg-[var(--surface-bg)] text-[var(--text-secondary)]'
                  }`}
                >
                  <LayoutList className="h-4 w-4" aria-hidden="true" />
                  <span>Tabela</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem(DEFAULT_VIEW_MODE_KEY, 'cards');
                    setDefaultViewMode('cards');
                    setViewMode('cards');
                    showToast('Visualização padrão definida para Cartões.');
                  }}
                  className={`h-12 px-4 rounded-[10px] border flex items-center gap-2.5 text-xs font-semibold transition-colors ${
                    defaultViewMode === 'cards'
                      ? 'border-[#1F2E85] bg-[var(--status-info-bg)] text-[#1F2E85] dark:text-[#8fa2ff]'
                      : 'border-[var(--border-default)] bg-[var(--surface-bg)] text-[var(--text-secondary)]'
                  }`}
                >
                  <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                  <span>Cartões</span>
                </button>
              </div>
            </div>
          </section>

          <section className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] p-6 shadow-[var(--shadow-card)] space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="h-9 w-9 rounded-[10px] bg-[#229A9A]/15 text-[#229A9A] flex items-center justify-center">
                <UserCheck className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                  Sessão e Segurança
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Informações do acesso autenticado nesta aba
                </p>
              </div>
            </div>

            <dl className="divide-y divide-[var(--border-default)] text-xs">
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Usuário</dt>
                <dd className="font-semibold text-[var(--text-primary)]">{user.nome}</dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">E-mail</dt>
                <dd className="font-medium text-[var(--text-primary)]">{user.email}</dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Perfil</dt>
                <dd className="font-semibold text-[#229A9A]">
                  {user.role === 'admin' ? 'Administrador' : 'Operador'}
                </dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Expiração automática</dt>
                <dd className="font-medium text-[var(--text-primary)]">
                  30 minutos sem atividade (sessão por aba)
                </dd>
              </div>
            </dl>
          </section>
        </div>
      )}

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

      {/* Modal rápido para escolher prestador e gerar Termo */}
      {termPickerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="term-picker-title"
          className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-[1px]"
        >
          <div className="animate-modal-expand w-full max-w-lg bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[12px] shadow-[var(--shadow-elevated)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border-default)] flex items-center justify-between">
              <h2
                id="term-picker-title"
                className="font-display text-base font-bold text-[var(--text-primary)]"
              >
                Selecionar prestador para gerar termo
              </h2>
              <button
                type="button"
                onClick={() => setTermPickerOpen(false)}
                aria-label="Fechar seleção"
                className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="p-4 border-b border-[var(--border-default)]">
              <input
                type="search"
                value={termPickerSearch}
                onChange={(e) => setTermPickerSearch(e.target.value)}
                placeholder="Buscar por nome, CPF ou CNPJ..."
                className="w-full h-10 px-3.5 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-bg)] text-sm text-[var(--text-primary)]"
              />
            </div>
            <ul className="max-h-80 overflow-y-auto divide-y divide-[var(--border-default)]">
              {pickerMatches.map((rec) => (
                <li key={rec.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setTermPickerOpen(false);
                      setTermPickerSearch('');
                      setQuickTermRecord(rec);
                    }}
                    className="w-full px-5 py-3 text-left hover:bg-[var(--surface-hover)] flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        {rec.fullName}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] font-mono tabular-nums">
                        CNPJ: {rec.cnpj}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-[#229A9A] shrink-0">
                      Selecionar
                    </span>
                  </button>
                </li>
              ))}
              {pickerMatches.length === 0 && (
                <li className="p-6 text-center text-xs text-[var(--text-muted)]">
                  Nenhum prestador encontrado.
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Janela de geração rápida de termo */}
      {quickTermRecord && (
        <DiscountTermModal
          registration={quickTermRecord}
          currentUser={user}
          onClose={() => setQuickTermRecord(null)}
          onTermCreated={() => {}}
        />
      )}
    </AdminLayout>
  );
}

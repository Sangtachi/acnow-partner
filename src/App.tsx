import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Home,
  LogOut,
  PackageSearch,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  Star,
  ToggleLeft,
  ToggleRight,
  UserRound,
  WalletCards,
  XCircle,
} from 'lucide-react';

type AdminRole = 'admin' | 'dispatch_admin' | 'ops_admin' | 'finance_admin' | 'super_admin';
type Role = 'customer' | 'seller' | 'technician' | AdminRole;
type TabKey = 'home' | 'dispatch' | 'reservation' | 'materials' | 'my';

type PartnerSession = {
  id: string;
  technicianId: string;
  role: Role;
  name: string;
  phone: string;
  status: string;
  workStatus?: string;
  baseRegion?: string | null;
  preview?: boolean;
  previewLabel?: string;
  adminName?: string;
  adminRole?: AdminRole;
};

type AdminTechnician = {
  id: string;
  name: string;
  phone?: string;
  status: string;
  workStatus?: string;
  baseRegion?: string | null;
};

type DispatchOffer = {
  id: string;
  orderNo: string;
  serviceType: string;
  serviceTypeLabel: string;
  airconType: string;
  airconTypeLabel: string;
  scheduleType: 'same_day' | 'reservation';
  scheduleLabel: string;
  scheduleText: string;
  regionLabel: string;
  customerPaymentAmount: number;
  expectedPayout: number;
  includedItems: string[];
  extraPotential: string;
  acceptanceDeadlineSec: number;
  distanceLabel: string;
  createdAt: string;
};

type PartnerHome = {
  technician: {
    id: string;
    name: string;
    workStatus: 'offline' | 'available' | 'busy' | 'reserved_only';
    baseRegion: string | null;
    grade: string;
    benefitText: string;
  };
  summary: {
    todayReservations: number;
    sameDayOffers: number;
    weeklyExpectedPayout: number;
    pendingPayout: number;
  };
  quickOffers: DispatchOffer[];
  todayJobs: Array<{
    id: string;
    orderNo: string;
    productName: string;
    scheduleText: string;
    regionLabel: string;
    orderStatus: string;
    expectedPayout: number;
  }>;
  materialAlerts: string[];
  notices: Array<{ id: string; title: string; body: string; createdAt: string }>;
  reviewSummary: ReviewSummary;
};

type Preferences = {
  regions: string[];
  serviceTypes: string[];
  airconTypes: string[];
  availabilityCodes: string[];
  minimumPayout: number | null;
  maxDistanceKm: number | null;
  sameDayEnabled: boolean;
  reservationEnabled: boolean;
};

type Material = {
  id: string;
  sellerId: string | null;
  name: string;
  code: string;
  category: string;
  unit: string;
  customerPrice: number | null;
  supplierName: string | null;
  description: string | null;
  imageUrl: string | null;
  stockQuantity: number;
  deliveryNote: string | null;
  minOrderQuantity: number;
};

type MaterialOrder = {
  id: string;
  orderNo: string;
  sellerName: string | null;
  status: string;
  totalAmount: number;
  deliveryAddress: string;
  createdAt: string;
  items: Array<{ id: string; name: string; quantity: number; amount: number }>;
};

type Settlement = {
  id: string;
  orderNo: string | null;
  grossAmount: number;
  platformFee: number | null;
  technicianPayout: number | null;
  status: string;
  payoutRequestedAt: string | null;
  createdAt: string;
};

type ReviewSummary = {
  averageRating: number | null;
  reviewCount: number;
  recent: Array<{ id: string; orderId: string; rating: number; comment: string | null; createdAt: string }>;
};

const SESSION_KEY = 'acnow_partner_session';
const POLL_MS = 15000;
const ADMIN_ROLES = new Set<AdminRole>(['admin', 'dispatch_admin', 'ops_admin', 'finance_admin', 'super_admin']);

function isAdminRole(role: unknown): role is AdminRole {
  return typeof role === 'string' && ADMIN_ROLES.has(role as AdminRole);
}

function isSupportedRole(role: unknown): role is Role {
  return role === 'customer' || role === 'seller' || role === 'technician' || isAdminRole(role);
}

function isReadOnlySession(session: PartnerSession): boolean {
  return session.preview === true || session.role !== 'technician';
}

function apiUrl(path: string): string {
  const raw = String(import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:4000').trim();
  const origin = raw.replace(/\/$/, '').replace(/\/api\/?$/i, '');
  const normalizedPath = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;
  return `${origin}${normalizedPath}`;
}

function readSession(): PartnerSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PartnerSession>;
    const role = parsed.role;
    if (!isSupportedRole(role) || !parsed.technicianId) return null;
    if (role !== 'technician' && !isAdminRole(role)) return null;
    return {
      id: String(parsed.id ?? parsed.technicianId),
      technicianId: String(parsed.technicianId),
      role,
      name: String(parsed.name ?? 'ACNow 파트너'),
      phone: String(parsed.phone ?? ''),
      status: String(parsed.status ?? 'approved'),
      workStatus: parsed.workStatus ? String(parsed.workStatus) : undefined,
      baseRegion: parsed.baseRegion ?? null,
      preview: Boolean(parsed.preview || role !== 'technician'),
      previewLabel: parsed.previewLabel ? String(parsed.previewLabel) : undefined,
      adminName: parsed.adminName ? String(parsed.adminName) : undefined,
      adminRole: isAdminRole(parsed.adminRole) ? parsed.adminRole : isAdminRole(role) ? role : undefined,
    };
  } catch {
    return null;
  }
}

function saveSession(session: PartnerSession | null): void {
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

async function readEnvelope<T>(res: Response): Promise<T> {
  let json: { ok?: boolean; data?: T; error?: unknown };
  try {
    json = (await res.json()) as { ok?: boolean; data?: T; error?: unknown };
  } catch {
    throw new Error('서버 응답을 확인하지 못했습니다.');
  }
  if (!json.ok) {
    const message =
      typeof json.error === 'string'
        ? json.error
        : typeof json.error === 'object' && json.error && 'message' in json.error
          ? String((json.error as { message?: unknown }).message)
          : '요청을 처리하지 못했습니다.';
    throw new Error(message);
  }
  return json.data as T;
}

async function publicApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: 'omit',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  return readEnvelope<T>(res);
}

async function partnerApi<T>(session: PartnerSession, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: 'omit',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-technician-id': session.technicianId,
      ...(init?.headers || {}),
    },
  });
  return readEnvelope<T>(res);
}

async function adminApi<T>(role: AdminRole, path: string, init?: RequestInit): Promise<T> {
  return publicApi<T>(path, {
    ...init,
    headers: {
      'x-admin-role': role,
      ...(init?.headers || {}),
    },
  });
}

function won(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '-';
  return `${Math.round(Number(value)).toLocaleString('ko-KR')}원`;
}

function statusLabel(status: string): string {
  return (
    {
      matching: '배차 대기',
      accepted: '수락',
      on_the_way: '출발',
      working: '작업중',
      completed: '완료',
      pending: '정산 대기',
      held: '보류',
      confirmed: '지급 요청',
      paid: '지급 완료',
      requested: '요청',
      preparing: '준비중',
      shipped: '배송중',
      delivered: '배송 완료',
      cancelled: '취소',
    } as Record<string, string>
  )[status] ?? status;
}

function App() {
  const [session, setSession] = useState<PartnerSession | null>(() => readSession());

  const handleLogout = () => {
    saveSession(null);
    setSession(null);
  };

  if (!session) {
    return <LoginScreen onSignedIn={setSession} />;
  }

  return <PartnerApp session={session} onLogout={handleLogout} />;
}

function LoginScreen({ onSignedIn }: { onSignedIn: (session: PartnerSession) => void }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const out = await publicApi<Partial<PartnerSession> & { role?: string }>('/auth/session', {
        method: 'POST',
        body: JSON.stringify({ phone, password }),
      });
      const role = out.role;
      if (role === 'technician' && out.technicianId) {
        const next: PartnerSession = {
          id: String(out.id ?? out.technicianId),
          technicianId: String(out.technicianId),
          role: 'technician',
          name: String(out.name ?? 'ACNow 파트너'),
          phone: String(out.phone ?? phone),
          status: String(out.status ?? 'approved'),
          workStatus: out.workStatus ? String(out.workStatus) : undefined,
          baseRegion: out.baseRegion ?? null,
        };
        saveSession(next);
        onSignedIn(next);
        return;
      }
      if (isAdminRole(role)) {
        const technicians = await adminApi<AdminTechnician[]>(role, '/admin/technicians');
        const preferredId = new URL(location.href).searchParams.get('technicianId');
        const approved = technicians.filter((t) => t.status === 'approved');
        const technician = approved.find((t) => t.id === preferredId) ?? approved[0] ?? null;
        if (!technician) {
          setMessage('관리자 미리보기로 보여줄 승인 기사 계정이 없습니다.');
          return;
        }
        const next: PartnerSession = {
          id: technician.id,
          technicianId: technician.id,
          role,
          name: technician.name || 'ACNow 파트너',
          phone: technician.phone || String(out.phone ?? phone),
          status: technician.status,
          workStatus: technician.workStatus,
          baseRegion: technician.baseRegion ?? null,
          preview: true,
          previewLabel: '관리자 파트너 미리보기',
          adminName: String(out.name ?? '관리자'),
          adminRole: role,
        };
        saveSession(next);
        onSignedIn(next);
        return;
      }
      if (role !== 'technician' || !out.technicianId) {
        const label = role === 'seller' ? '판매자' : role === 'customer' ? '고객' : '관리자';
        setMessage(`${label} 계정입니다. ACNow 파트너 앱은 승인 기사 계정으로 로그인해 주세요.`);
        return;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-hero">
        <img src="/branding/icon-mark.png" alt="ACNow" className="login-logo" />
        <p className="eyebrow">ACNow 파트너</p>
        <h1>일감을 받고, 작업을 처리하고, 자재와 정산까지 확인하세요.</h1>
        <p className="login-copy">
          기사님은 업무앱으로 바로 이동하고, 관리자는 승인 기사 화면을 운영 미리보기로 확인할 수 있습니다.
        </p>
      </section>
      <form className="login-panel" onSubmit={submit}>
        <label>
          전화번호
          <input
            inputMode="numeric"
            autoComplete="tel"
            placeholder="01012345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            autoComplete="current-password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? '확인 중' : '파트너 로그인'}
        </button>
        {message ? <p className="form-message">{message}</p> : null}
      </form>
    </main>
  );
}

function PartnerApp({ session, onLogout }: { session: PartnerSession; onLogout: () => void }) {
  const [tab, setTab] = useState<TabKey>('home');
  const [home, setHome] = useState<PartnerHome | null>(null);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadHome = useCallback(async () => {
    setRefreshing(true);
    setHomeError(null);
    try {
      setHome(await partnerApi<PartnerHome>(session, '/technician/partner/home'));
    } catch (error) {
      setHomeError(error instanceof Error ? error.message : '홈 데이터를 불러오지 못했습니다.');
    } finally {
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    loadHome();
    const id = window.setInterval(loadHome, POLL_MS);
    return () => window.clearInterval(id);
  }, [loadHome]);

  const title = {
    home: '홈',
    dispatch: '배차',
    reservation: '예약',
    materials: '자재몰',
    my: '마이',
  }[tab];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-row">
          <img src="/branding/icon-mark.png" alt="" className="brand-mark" />
          <div>
            <p className="brand-kicker">ACNow 파트너</p>
            <h1>{title}</h1>
          </div>
        </div>
        <button type="button" className="icon-button" onClick={loadHome} aria-label="새로고침">
          <RefreshCw size={18} className={refreshing ? 'spin' : ''} />
        </button>
      </header>

      <main className="app-content">
        {isReadOnlySession(session) ? (
          <div className="preview-banner">
            <strong>{session.previewLabel ?? '관리자 파트너 미리보기'}</strong>
            <span>
              {session.adminName ? `${session.adminName} 관리자 계정으로 ` : ''}
              {session.name} 기사님의 파트너 화면을 확인 중입니다. 변경 동작은 막혀 있습니다.
            </span>
          </div>
        ) : null}
        {homeError ? <NoticeTone tone="danger">{homeError}</NoticeTone> : null}
        {tab === 'home' ? <HomeTab session={session} home={home} onReload={loadHome} /> : null}
        {tab === 'dispatch' ? <DispatchTab session={session} /> : null}
        {tab === 'reservation' ? <ReservationTab session={session} /> : null}
        {tab === 'materials' ? <MaterialsTab session={session} /> : null}
        {tab === 'my' ? <MyTab session={session} home={home} onLogout={onLogout} /> : null}
      </main>

      <nav className="tabbar">
        <TabButton active={tab === 'home'} icon={<Home size={19} />} label="홈" onClick={() => setTab('home')} />
        <TabButton
          active={tab === 'dispatch'}
          icon={<BriefcaseBusiness size={19} />}
          label="배차"
          onClick={() => setTab('dispatch')}
        />
        <TabButton
          active={tab === 'reservation'}
          icon={<CalendarDays size={19} />}
          label="예약"
          onClick={() => setTab('reservation')}
        />
        <TabButton
          active={tab === 'materials'}
          icon={<ShoppingBag size={19} />}
          label="자재몰"
          onClick={() => setTab('materials')}
        />
        <TabButton active={tab === 'my'} icon={<UserRound size={19} />} label="마이" onClick={() => setTab('my')} />
      </nav>
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`tab-button ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function HomeTab({
  session,
  home,
  onReload,
}: {
  session: PartnerSession;
  home: PartnerHome | null;
  onReload: () => void;
}) {
  const workStatus = home?.technician.workStatus ?? session.workStatus ?? 'offline';
  const [busy, setBusy] = useState(false);
  const readOnly = isReadOnlySession(session);

  async function toggleAvailable() {
    if (readOnly) return;
    setBusy(true);
    try {
      await partnerApi(session, '/technician/me/work-status', {
        method: 'PATCH',
        body: JSON.stringify({ workStatus: workStatus === 'available' ? 'offline' : 'available' }),
      });
      await onReload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <section className="earning-hero">
        <div>
          <p className="eyebrow">오늘 돈 벌 수 있는 화면</p>
          <h2>{home?.technician.name ?? session.name} 기사님</h2>
          <p>{home?.technician.benefitText ?? '서버 기준 배차와 정산을 불러오는 중입니다.'}</p>
        </div>
        <button
          type="button"
          className={`availability ${workStatus === 'available' ? 'on' : ''}`}
          onClick={toggleAvailable}
          disabled={busy || readOnly}
        >
          {workStatus === 'available' ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
          <span>출동 가능 {workStatus === 'available' ? 'ON' : 'OFF'}</span>
        </button>
      </section>

      <section className="summary-grid">
        <Metric label="오늘 예약 작업" value={`${home?.summary.todayReservations ?? 0}건`} />
        <Metric label="실시간 배차 가능" value={`${home?.summary.sameDayOffers ?? 0}건`} />
        <Metric label="이번 주 예상 정산" value={won(home?.summary.weeklyExpectedPayout ?? 0)} />
        <Metric label="정산 대기" value={won(home?.summary.pendingPayout ?? 0)} />
      </section>

      <SectionTitle title="빠른 배차" action="15초마다 갱신" />
      <div className="stack small">
        {(home?.quickOffers ?? []).length === 0 ? (
          <EmptyState title="지금 받을 수 있는 당일 콜이 없습니다" body="출동 가능 상태와 선호 배차 조건을 확인해 주세요." />
        ) : (
          home!.quickOffers.map((offer) => <OfferCard key={offer.id} offer={offer} session={session} compact />)
        )}
      </div>

      <SectionTitle title="오늘 예정 작업" />
      <div className="stack small">
        {(home?.todayJobs ?? []).length === 0 ? (
          <EmptyState title="오늘 확정된 작업이 없습니다" body="배차와 예약 탭에서 받을 수 있는 콜을 확인하세요." />
        ) : (
          home!.todayJobs.map((job) => (
            <article className="list-card" key={job.id}>
              <div>
                <strong>{job.productName}</strong>
                <p>{job.regionLabel} · {job.scheduleText}</p>
              </div>
              <span>{won(job.expectedPayout)}</span>
            </article>
          ))
        )}
      </div>

      <SectionTitle title="자재 알림" />
      <div className="chip-list">
        {(home?.materialAlerts ?? ['예약 작업 기준 자재 알림을 불러오는 중']).map((item) => (
          <span className="info-chip" key={item}>{item}</span>
        ))}
      </div>

      <SectionTitle title="공지" />
      <div className="stack small">
        {(home?.notices ?? []).map((notice) => (
          <NoticeTone key={notice.id}>
            <strong>{notice.title}</strong>
            <span>{notice.body}</span>
          </NoticeTone>
        ))}
      </div>
    </div>
  );
}

function DispatchTab({ session }: { session: PartnerSession }) {
  return <OffersSurface session={session} type="same_day" range="today" emptyTitle="지금 열린 당일 배차가 없습니다" />;
}

function ReservationTab({ session }: { session: PartnerSession }) {
  const [range, setRange] = useState<'today' | 'tomorrow' | 'week' | 'next_week'>('week');
  return (
    <div className="stack">
      <div className="segmented">
        {(['today', 'tomorrow', 'week', 'next_week'] as const).map((key) => (
          <button key={key} className={range === key ? 'active' : ''} onClick={() => setRange(key)} type="button">
            {({ today: '오늘', tomorrow: '내일', week: '이번 주', next_week: '다음 주' } as const)[key]}
          </button>
        ))}
      </div>
      <OffersSurface session={session} type="reservation" range={range} emptyTitle="해당 기간 예약 콜이 없습니다" />
      <PreferencePanel session={session} />
    </div>
  );
}

function OffersSurface({
  session,
  type,
  range,
  emptyTitle,
}: {
  session: PartnerSession;
  type: 'same_day' | 'reservation';
  range: 'today' | 'tomorrow' | 'week' | 'next_week';
  emptyTitle: string;
}) {
  const [offers, setOffers] = useState<DispatchOffer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOffers(await partnerApi<DispatchOffer[]>(session, `/technician/dispatch/offers?type=${type}&range=${range}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : '배차 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [range, session, type]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <div className="stack">
      <SectionTitle
        title={type === 'same_day' ? '실시간 배차' : '예약 배차'}
        action={loading ? '불러오는 중' : '새로고침'}
        onAction={load}
      />
      {error ? <NoticeTone tone="danger">{error}</NoticeTone> : null}
      {offers.length === 0 ? (
        <EmptyState title={emptyTitle} body="지역, 작업 유형, 최소 정산금 조건을 조정하면 더 많은 콜을 볼 수 있습니다." />
      ) : (
        offers.map((offer) => <OfferCard key={offer.id} offer={offer} session={session} onChanged={load} />)
      )}
    </div>
  );
}

function OfferCard({
  offer,
  session,
  compact,
  onChanged,
}: {
  offer: DispatchOffer;
  session: PartnerSession;
  compact?: boolean;
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const readOnly = isReadOnlySession(session);

  async function action(kind: 'accept' | 'reject') {
    if (readOnly) {
      setMessage('관리자 미리보기에서는 배차 상태를 변경하지 않습니다.');
      return;
    }
    setBusy(kind);
    setMessage(null);
    try {
      await partnerApi(session, `/technician/dispatch/offers/${offer.id}/${kind}`, { method: 'POST' });
      setMessage(kind === 'accept' ? '수락 완료. 상세주소와 연락수단은 확정 작업에서 확인하세요.' : '거절 처리했습니다.');
      onChanged?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '처리하지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="offer-card">
      <div className="offer-top">
        <span className="badge">{offer.scheduleLabel} {offer.serviceTypeLabel}</span>
        <span className="timer">{offer.acceptanceDeadlineSec}초 안에 수락</span>
      </div>
      <h3>{offer.airconTypeLabel} 에어컨 {offer.serviceTypeLabel}</h3>
      <p className="muted">{offer.regionLabel} / {offer.scheduleText}</p>
      <div className="amount-row">
        <span>고객 결제금액 <strong>{won(offer.customerPaymentAmount)}</strong></span>
        <span>예상 정산금 <strong>{won(offer.expectedPayout)} 내외</strong></span>
      </div>
      {!compact ? (
        <>
          <div className="included">
            <strong>포함</strong>
            <ul>
              {offer.includedItems.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <p className="muted">추가금 가능성: {offer.extraPotential} · 거리: {offer.distanceLabel}</p>
        </>
      ) : null}
      {message ? <p className="inline-message">{message}</p> : null}
      <div className="button-row">
        <button type="button" className="primary-button" disabled={!!busy || readOnly} onClick={() => action('accept')}>
          {busy === 'accept' ? '수락 중' : offer.scheduleType === 'reservation' ? '예약 수락' : '수락하기'}
        </button>
        <button type="button" className="secondary-button" disabled={!!busy || readOnly} onClick={() => action('reject')}>
          거절
        </button>
      </div>
    </article>
  );
}

function MaterialsTab({ session }: { session: PartnerSession }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('전체');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [orders, setOrders] = useState<MaterialOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const readOnly = isReadOnlySession(session);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [m, o] = await Promise.all([
        partnerApi<Material[]>(session, '/technician/materials'),
        partnerApi<MaterialOrder[]>(session, '/technician/material-orders'),
      ]);
      setMaterials(m);
      setOrders(o);
    } catch (err) {
      setError(err instanceof Error ? err.message : '자재몰 데이터를 불러오지 못했습니다.');
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(() => ['전체', ...new Set(materials.map((m) => m.category).filter(Boolean))], [materials]);
  const filtered = materials.filter((m) => {
    const text = `${m.name} ${m.category} ${m.supplierName ?? ''}`.toLowerCase();
    return (category === '전체' || m.category === category) && text.includes(query.toLowerCase());
  });

  async function requestOrder(material: Material) {
    if (readOnly) {
      setError('관리자 미리보기에서는 자재 구매요청을 만들지 않습니다.');
      return;
    }
    const quantityRaw = window.prompt('구매 수량을 입력해 주세요.', String(Math.max(1, material.minOrderQuantity || 1)));
    if (!quantityRaw) return;
    const quantity = Math.max(material.minOrderQuantity || 1, Math.floor(Number(quantityRaw) || 1));
    const deliveryAddress = window.prompt('배송지 또는 수령 장소를 입력해 주세요.', '') ?? '';
    setBusyId(material.id);
    setError(null);
    try {
      await partnerApi(session, '/technician/material-orders', {
        method: 'POST',
        body: JSON.stringify({
          items: [{ materialId: material.id, quantity }],
          deliveryAddress,
        }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '구매요청에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="stack">
      <div className="search-box">
        <Search size={18} />
        <input placeholder="배관, 냉매, 전선, 타공, 청소" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="chip-list">
        {categories.map((c) => (
          <button type="button" className={`filter-chip ${category === c ? 'active' : ''}`} key={c} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>
      <NoticeTone>
        <strong>작업 연동 자재몰</strong>
        <span>수락한 설치·청소 작업 기준으로 필요한 자재를 먼저 확인하세요.</span>
      </NoticeTone>
      {error ? <NoticeTone tone="danger">{error}</NoticeTone> : null}
      <SectionTitle title="추천·판매 자재" action="새로고침" onAction={load} />
      <div className="material-grid">
        {filtered.map((m) => (
          <article className="material-card" key={m.id}>
            {m.imageUrl ? <img src={m.imageUrl} alt="" /> : <div className="material-placeholder"><PackageSearch /></div>}
            <div>
              <span className="badge">{m.category}</span>
              <h3>{m.name}</h3>
              <p>{m.supplierName || '판매자 미지정'} · 재고 {m.stockQuantity}</p>
              {m.description ? <p className="muted">{m.description}</p> : null}
              <div className="material-bottom">
                <strong>{won(m.customerPrice)}</strong>
                <button type="button" className="secondary-button" disabled={busyId === m.id || readOnly} onClick={() => requestOrder(m)}>
                  구매요청
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <SectionTitle title="주문내역" />
      <div className="stack small">
        {orders.length === 0 ? <EmptyState title="자재 구매요청이 없습니다" body="필요한 자재를 선택해 요청을 남겨 주세요." /> : null}
        {orders.map((order) => (
          <article className="list-card vertical" key={order.id}>
            <div className="list-card-head">
              <strong>{order.orderNo}</strong>
              <span className="badge">{statusLabel(order.status)}</span>
            </div>
            <p>{order.sellerName || '판매자 미지정'} · {won(order.totalAmount)}</p>
            <ul className="mini-list">
              {order.items.map((item) => <li key={item.id}>{item.name} × {item.quantity}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}

function MyTab({
  session,
  home,
  onLogout,
}: {
  session: PartnerSession;
  home: PartnerHome | null;
  onLogout: () => void;
}) {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [reviews, setReviews] = useState<ReviewSummary | null>(home?.reviewSummary ?? null);
  const [error, setError] = useState<string | null>(null);
  const readOnly = isReadOnlySession(session);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, r] = await Promise.all([
        partnerApi<Settlement[]>(session, '/technician/settlements'),
        partnerApi<ReviewSummary>(session, '/technician/reviews'),
      ]);
      setSettlements(s);
      setReviews(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : '마이 데이터를 불러오지 못했습니다.');
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  async function requestPayout(id: string) {
    if (readOnly) {
      setError('관리자 미리보기에서는 지급 요청을 만들지 않습니다.');
      return;
    }
    try {
      await partnerApi(session, `/technician/settlements/${id}/request-payout`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '지급 요청을 처리하지 못했습니다.');
    }
  }

  return (
    <div className="stack">
      <section className="profile-panel">
        <div>
          <p className="eyebrow">{home?.technician.grade ?? 'ACNow 파트너'}</p>
          <h2>{session.name} 기사님</h2>
          <p>{session.baseRegion || home?.technician.baseRegion || '활동 지역 미설정'}</p>
        </div>
        <div className="rating">
          <Star size={18} />
          <strong>{reviews?.averageRating ?? '-'}</strong>
          <span>{reviews?.reviewCount ?? 0}개 리뷰</span>
        </div>
      </section>
      {error ? <NoticeTone tone="danger">{error}</NoticeTone> : null}
      <PreferencePanel session={session} />
      <SectionTitle title="정산" action="새로고침" onAction={load} />
      <div className="stack small">
        {settlements.length === 0 ? <EmptyState title="정산 내역이 없습니다" body="작업 완료 후 정산 행이 생성됩니다." /> : null}
        {settlements.map((row) => (
          <article className="list-card vertical" key={row.id}>
            <div className="list-card-head">
              <strong>{row.orderNo || row.id.slice(0, 8)}</strong>
              <span className="badge">{statusLabel(row.status)}</span>
            </div>
            <p>총액 {won(row.grossAmount)} · 지급액 {won(row.technicianPayout)}</p>
            {['pending', 'held'].includes(row.status) ? (
              <button type="button" className="secondary-button" disabled={readOnly} onClick={() => requestPayout(row.id)}>
                지급 요청
              </button>
            ) : null}
          </article>
        ))}
      </div>
      <SectionTitle title="최근 리뷰" />
      <div className="stack small">
        {(reviews?.recent ?? []).length === 0 ? <EmptyState title="아직 리뷰가 없습니다" body="작업 완료 후 고객 평가가 표시됩니다." /> : null}
        {(reviews?.recent ?? []).map((review) => (
          <article className="list-card vertical" key={review.id}>
            <strong>평점 {review.rating}/5</strong>
            <p>{review.comment || '코멘트 없음'}</p>
          </article>
        ))}
      </div>
      <button type="button" className="logout-button" onClick={onLogout}>
        <LogOut size={17} /> 로그아웃
      </button>
    </div>
  );
}

function PreferencePanel({ session }: { session: PartnerSession }) {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const readOnly = isReadOnlySession(session);

  const load = useCallback(async () => {
    try {
      setPrefs(await partnerApi<Preferences>(session, '/technician/preferences'));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '선호 조건을 불러오지 못했습니다.');
    }
  }, [session]);

  useEffect(() => {
    if (open) load();
  }, [load, open]);

  async function save() {
    if (!prefs) return;
    if (readOnly) {
      setMessage('관리자 미리보기에서는 선호 배차 조건을 저장하지 않습니다.');
      return;
    }
    setMessage(null);
    try {
      setPrefs(await partnerApi<Preferences>(session, '/technician/preferences', {
        method: 'PATCH',
        body: JSON.stringify(prefs),
      }));
      setMessage('선호 배차 조건을 저장했습니다.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '저장하지 못했습니다.');
    }
  }

  return (
    <section className="preference-panel">
      <button type="button" className="panel-toggle" onClick={() => setOpen((v) => !v)}>
        <span><Settings size={17} /> 선호 배차 설정</span>
        <ChevronRight size={17} className={open ? 'rotated' : ''} />
      </button>
      {open && prefs ? (
        <div className="preference-body">
          <label>
            지역
            <input
              disabled={readOnly}
              value={prefs.regions.join(', ')}
              onChange={(e) => setPrefs({ ...prefs, regions: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })}
              placeholder="고양시 덕양구, 파주시 운정동"
            />
          </label>
          <label>
            최소 정산금
            <input
              disabled={readOnly}
              type="number"
              value={prefs.minimumPayout ?? ''}
              onChange={(e) => setPrefs({ ...prefs, minimumPayout: e.target.value ? Number(e.target.value) : null })}
              placeholder="120000"
            />
          </label>
          <label>
            거리
            <input
              disabled={readOnly}
              type="number"
              value={prefs.maxDistanceKm ?? ''}
              onChange={(e) => setPrefs({ ...prefs, maxDistanceKm: e.target.value ? Number(e.target.value) : null })}
              placeholder="20"
            />
          </label>
          <div className="switch-row">
            <button
              type="button"
              className={prefs.sameDayEnabled ? 'active' : ''}
              disabled={readOnly}
              onClick={() => setPrefs({ ...prefs, sameDayEnabled: !prefs.sameDayEnabled })}
            >
              당일 설치 가능
            </button>
            <button
              type="button"
              className={prefs.reservationEnabled ? 'active' : ''}
              disabled={readOnly}
              onClick={() => setPrefs({ ...prefs, reservationEnabled: !prefs.reservationEnabled })}
            >
              예약 가능
            </button>
          </div>
          <button type="button" className="primary-button" disabled={readOnly} onClick={save}>저장</button>
        </div>
      ) : null}
      {message ? <p className="inline-message">{message}</p> : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {action ? <button type="button" onClick={onAction}>{action}</button> : null}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <CheckCircle2 size={22} />
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function NoticeTone({ children, tone }: { children: ReactNode; tone?: 'danger' }) {
  return (
    <div className={`notice-tone ${tone === 'danger' ? 'danger' : ''}`}>
      {tone === 'danger' ? <XCircle size={18} /> : <Bell size={18} />}
      <div>{children}</div>
    </div>
  );
}

export default App;

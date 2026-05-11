import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { PushNotifications } from '@capacitor/push-notifications';
import {
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Camera as CameraIcon,
  CreditCard,
  FileText,
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

type TechnicianJob = {
  id: string;
  orderNo: string;
  orderStatus: string;
  paymentStatus: string;
  assignedTechnicianId: string | null;
  customerName: string;
  customerPhone: string;
  addressSummary: string;
  productName: string;
  scheduleType: string;
  serviceType: string;
  airconType: string;
  basePrice: number;
  productTotalPrice: number;
  extraTotalPrice: number;
  totalPrice: number;
  customerMemo?: string | null;
  adminMemo?: string | null;
};

type OrderPhoto = {
  id: string;
  orderId: string;
  technicianId: string | null;
  kind: 'before_work' | 'after_work' | 'other';
  url: string;
  caption: string | null;
  createdAt: string;
};

type ServiceAddon = {
  id: string;
  name: string;
  code: string;
  unit: string;
  customerPrice: number | null;
  description?: string | null;
};

type ExtraQuoteItem = {
  id: string;
  quoteId: string;
  addonId: string | null;
  materialId: string | null;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
};

type ExtraQuote = {
  id: string;
  orderId: string;
  technicianId: string | null;
  status: 'requested' | 'approved' | 'paid' | 'rejected' | 'cancelled';
  totalAmount: number;
  customerApprovedAt: string | null;
  paidAt: string | null;
  memo: string | null;
  createdAt: string;
  items: ExtraQuoteItem[];
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

/** 배포된 Nest API origin만 (끝 / 와 /api 제거). 로컬 dev 에서만 기본값 사용 — Vite 빌드에 미설정 시 127.0.0.1 으로 가면 사용자 PC 로만 요청되어 로그인 불가 */
function apiOrigin(): string {
  const raw = String(import.meta.env.VITE_API_BASE_URL ?? '').trim();
  const origin = raw.replace(/\/$/, '').replace(/\/api\/?$/i, '');
  if (origin.length > 0) return origin;
  if (import.meta.env.DEV) return 'http://127.0.0.1:4000';
  return '';
}

function apiPath(path: string): string {
  return path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;
}

function apiUrl(path: string): string {
  const origin = apiOrigin();
  const normalizedPath = apiPath(path);
  if (!origin) {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}${normalizedPath}`;
    }
    return normalizedPath;
  }
  return `${origin}${normalizedPath}`;
}

const PROD_MISSING_API_URL =
  import.meta.env.PROD && !String(import.meta.env.VITE_API_BASE_URL ?? '').trim();

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
  if (PROD_MISSING_API_URL) {
    throw new Error(
      '배포 설정 오류: Vercel(또는 빌드 환경)에 VITE_API_BASE_URL 이 없습니다. Nest API 주소(https://…)를 넣고 재배포하세요.',
    );
  }
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      credentials: 'omit',
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Failed to fetch') || msg.includes('Load failed') || msg.includes('NetworkError')) {
      throw new Error(
        '서버에 연결하지 못했습니다. VITE_API_BASE_URL(Nest 주소)과 API 서버 CORS_ORIGIN(이 웹앱 https 주소)을 확인하세요.',
      );
    }
    throw e;
  }
  return readEnvelope<T>(res);
}

async function partnerApi<T>(session: PartnerSession, path: string, init?: RequestInit): Promise<T> {
  if (PROD_MISSING_API_URL) {
    throw new Error(
      '배포 설정 오류: VITE_API_BASE_URL 이 없습니다. Vercel 환경 변수를 설정한 뒤 재배포하세요.',
    );
  }
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

async function partnerFormApi<T>(session: PartnerSession, path: string, form: FormData): Promise<T> {
  if (PROD_MISSING_API_URL) {
    throw new Error('배포 설정 오류: VITE_API_BASE_URL 이 없습니다. Vercel 환경 변수를 설정한 뒤 재배포하세요.');
  }
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    credentials: 'omit',
    headers: {
      'x-technician-id': session.technicianId,
    },
    body: form,
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

async function registerNativePush(session: PartnerSession): Promise<void> {
  if (isReadOnlySession(session)) return;
  if (!Capacitor.isNativePlatform()) return;
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return;
  await PushNotifications.addListener('registration', (token) => {
    void partnerApi(session, '/technician/notifications/devices', {
      method: 'POST',
      body: JSON.stringify({
        channel: 'fcm',
        token: token.value,
        platform: Capacitor.getPlatform(),
        deviceLabel: 'ACNow 파트너 앱',
      }),
    }).catch(() => undefined);
  });
  await PushNotifications.addListener('registrationError', () => undefined);
  await PushNotifications.register();
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
      {PROD_MISSING_API_URL ? (
        <div
          className="form-message"
          style={{
            margin: '0 auto 1rem',
            maxWidth: 420,
            padding: '0.75rem 1rem',
            borderRadius: 12,
            background: 'rgba(220,38,38,0.12)',
            color: '#7f1d1d',
            fontSize: 13,
            lineHeight: 1.5,
          }}
          role="alert"
        >
          <strong>배포 설정 필요:</strong> Vercel 프로젝트 → Settings → Environment Variables 에{' '}
          <code style={{ wordBreak: 'break-all' }}>VITE_API_BASE_URL</code> = 귀하의 Nest API origin(예:{' '}
          <code>https://api.example.com</code>, 끝에 <code>/api</code> 붙이지 않음)을 추가한 뒤 <strong>Redeploy</strong>
          하세요.
        </div>
      ) : null}
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
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

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

  useEffect(() => {
    void registerNativePush(session).catch(() => undefined);
  }, [session]);

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
        {tab === 'home' ? <HomeTab session={session} home={home} onReload={loadHome} onOpenJob={setSelectedJobId} /> : null}
        {tab === 'dispatch' ? <DispatchTab session={session} /> : null}
        {tab === 'reservation' ? <ReservationTab session={session} /> : null}
        {tab === 'materials' ? <MaterialsTab session={session} /> : null}
        {tab === 'my' ? <MyTab session={session} home={home} onLogout={onLogout} /> : null}
      </main>

      {selectedJobId ? (
        <JobDetailSheet
          session={session}
          orderId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
          onChanged={loadHome}
        />
      ) : null}

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
  onOpenJob,
}: {
  session: PartnerSession;
  home: PartnerHome | null;
  onReload: () => void;
  onOpenJob: (orderId: string) => void;
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
            <article className="list-card clickable" key={job.id} onClick={() => onOpenJob(job.id)}>
              <div>
                <strong>{job.productName}</strong>
                <p>{job.regionLabel} · {job.scheduleText}</p>
              </div>
              <span>{won(job.expectedPayout)} <ChevronRight size={15} /></span>
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

function JobDetailSheet({
  session,
  orderId,
  onClose,
  onChanged,
}: {
  session: PartnerSession;
  orderId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [job, setJob] = useState<TechnicianJob | null>(null);
  const [photos, setPhotos] = useState<OrderPhoto[]>([]);
  const [quotes, setQuotes] = useState<ExtraQuote[]>([]);
  const [addons, setAddons] = useState<ServiceAddon[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedAddonId, setSelectedAddonId] = useState('');
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [quoteMemo, setQuoteMemo] = useState('');
  const [quoteLines, setQuoteLines] = useState<Array<{
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    addonId?: string;
    materialId?: string;
  }>>([]);
  const readOnly = isReadOnlySession(session);

  const load = useCallback(async () => {
    setMessage(null);
    try {
      const [j, p, q, a, m] = await Promise.all([
        partnerApi<TechnicianJob>(session, `/technician/jobs/${orderId}`),
        partnerApi<OrderPhoto[]>(session, `/technician/jobs/${orderId}/photos`),
        partnerApi<ExtraQuote[]>(session, `/technician/jobs/${orderId}/extra-quotes`),
        publicApi<ServiceAddon[]>('/service-addons'),
        partnerApi<Material[]>(session, '/technician/materials'),
      ]);
      setJob(j);
      setPhotos(p);
      setQuotes(q);
      setAddons(a.filter((x) => x.customerPrice != null));
      setMaterials(m);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '작업 상세를 불러오지 못했습니다.');
    }
  }, [orderId, session]);

  useEffect(() => {
    load();
  }, [load]);

  const photoKinds = new Set(photos.map((p) => p.kind));
  const canComplete = job?.orderStatus === 'working' && photoKinds.has('before_work') && photoKinds.has('after_work');
  const quoteTotal = quoteLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

  async function runAction(action: 'depart' | 'start' | 'complete') {
    if (readOnly) {
      setMessage('관리자 미리보기에서는 작업 상태를 변경하지 않습니다.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await partnerApi(session, `/technician/jobs/${orderId}/${action}`, { method: 'PATCH' });
      await load();
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '처리하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(kind: OrderPhoto['kind'], file?: File) {
    if (readOnly) {
      setMessage('관리자 미리보기에서는 사진을 등록하지 않습니다.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      let uploadFile = file;
      if (!uploadFile && Capacitor.isNativePlatform()) {
        const photo = await Camera.getPhoto({
          quality: 72,
          resultType: CameraResultType.Uri,
          source: CameraSource.Camera,
        });
        if (!photo.webPath) throw new Error('사진 파일을 읽지 못했습니다.');
        const blob = await fetch(photo.webPath).then((res) => res.blob());
        uploadFile = new File([blob], `${kind}-${Date.now()}.${photo.format || 'jpg'}`, {
          type: blob.type || 'image/jpeg',
        });
      }
      if (!uploadFile) throw new Error('사진 파일을 선택해 주세요.');
      const form = new FormData();
      form.set('kind', kind);
      form.set('caption', kind === 'before_work' ? '작업 전' : kind === 'after_work' ? '작업 후' : '현장 사진');
      form.set('file', uploadFile);
      await partnerFormApi<OrderPhoto>(session, `/technician/jobs/${orderId}/photos/upload`, form);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '사진 업로드에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  function addAddonLine() {
    const addon = addons.find((x) => x.id === selectedAddonId);
    const qty = Math.max(0.001, Number(quantity) || 1);
    if (!addon || addon.customerPrice == null) return;
    setQuoteLines((lines) => [
      ...lines,
      { name: addon.name, quantity: qty, unit: addon.unit || 'each', unitPrice: addon.customerPrice ?? 0, addonId: addon.id },
    ]);
  }

  function addMaterialLine() {
    const material = materials.find((x) => x.id === selectedMaterialId);
    const qty = Math.max(0.001, Number(quantity) || 1);
    if (!material || material.customerPrice == null) return;
    setQuoteLines((lines) => [
      ...lines,
      { name: material.name, quantity: qty, unit: material.unit || 'each', unitPrice: material.customerPrice ?? 0, materialId: material.id },
    ]);
  }

  function addCustomLine() {
    const name = customName.trim();
    const price = Math.max(0, Math.round(Number(customPrice) || 0));
    if (!name || price <= 0) return;
    setQuoteLines((lines) => [...lines, { name, quantity: 1, unit: 'job', unitPrice: price }]);
    setCustomName('');
    setCustomPrice('');
  }

  async function sendQuote() {
    if (readOnly) {
      setMessage('관리자 미리보기에서는 최종 명세서를 발송하지 않습니다.');
      return;
    }
    if (quoteLines.length === 0) {
      setMessage('추가금 항목을 1개 이상 추가해 주세요.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await partnerApi(session, `/technician/jobs/${orderId}/extra-quotes`, {
        method: 'POST',
        body: JSON.stringify({ memo: quoteMemo, items: quoteLines }),
      });
      setQuoteLines([]);
      setQuoteMemo('');
      await load();
      await onChanged();
      setMessage('고객에게 최종 명세서를 보냈습니다.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '명세서를 보내지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true">
      <section className="job-sheet">
        <header className="sheet-header">
          <div>
            <p className="eyebrow">작업 상세</p>
            <h2>{job?.productName ?? '작업 불러오는 중'}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
            <XCircle size={20} />
          </button>
        </header>

        {message ? <NoticeTone tone={message.includes('실패') || message.includes('못') ? 'danger' : 'info'}>{message}</NoticeTone> : null}

        {job ? (
          <div className="stack">
            <section className="job-summary">
              <div>
                <span className="badge">{statusLabel(job.orderStatus)}</span>
                <h3>{job.orderNo}</h3>
                <p>{job.addressSummary}</p>
              </div>
              <div>
                <strong>{job.customerName}</strong>
                <span>{job.customerPhone}</span>
              </div>
            </section>

            <section className="amount-breakdown">
              <div><span>기본 설치·청소 금액</span><strong>{won(job.productTotalPrice || job.basePrice)}</strong></div>
              <div><span>추가금 반영액</span><strong>{won(job.extraTotalPrice)}</strong></div>
              <div><span>현재 주문 합계</span><strong>{won(job.totalPrice)}</strong></div>
            </section>

            <div className="button-row">
              <button className="secondary-button" type="button" disabled={busy || readOnly || job.orderStatus !== 'accepted'} onClick={() => runAction('depart')}>출발</button>
              <button className="secondary-button" type="button" disabled={busy || readOnly || !['accepted', 'on_the_way'].includes(job.orderStatus)} onClick={() => runAction('start')}>작업 시작</button>
              <button className="primary-button" type="button" disabled={busy || readOnly || !canComplete} onClick={() => runAction('complete')}>
                {canComplete ? '완료 요청' : '전/후 사진 필요'}
              </button>
            </div>

            <SectionTitle title="작업 사진" />
            <div className="photo-actions">
              <PhotoUploadButton label="작업 전 사진" kind="before_work" onUpload={uploadPhoto} disabled={busy || readOnly} />
              <PhotoUploadButton label="작업 후 사진" kind="after_work" onUpload={uploadPhoto} disabled={busy || readOnly} />
            </div>
            <div className="photo-grid">
              {photos.map((photo) => (
                <figure key={photo.id}>
                  <img src={photo.url} alt={photo.caption ?? photo.kind} />
                  <figcaption>{photo.kind === 'before_work' ? '작업 전' : photo.kind === 'after_work' ? '작업 후' : '기타'}</figcaption>
                </figure>
              ))}
            </div>

            <SectionTitle title="최종 명세서 작성" />
            <div className="quote-builder">
              <div className="quote-line-controls">
                <select value={selectedAddonId} onChange={(e) => setSelectedAddonId(e.target.value)}>
                  <option value="">추가비 항목 선택</option>
                  {addons.map((addon) => <option key={addon.id} value={addon.id}>{addon.name} · {won(addon.customerPrice)}</option>)}
                </select>
                <select value={selectedMaterialId} onChange={(e) => setSelectedMaterialId(e.target.value)}>
                  <option value="">자재 선택</option>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.name} · {won(m.customerPrice)}</option>)}
                </select>
                <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" placeholder="수량" />
                <button type="button" className="secondary-button" onClick={addAddonLine}>추가비 담기</button>
                <button type="button" className="secondary-button" onClick={addMaterialLine}>자재 담기</button>
              </div>
              <div className="quote-line-controls">
                <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="기타비 항목명" />
                <input value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} inputMode="numeric" placeholder="금액" />
                <button type="button" className="secondary-button" onClick={addCustomLine}>기타비 담기</button>
              </div>
              <textarea value={quoteMemo} onChange={(e) => setQuoteMemo(e.target.value)} placeholder="고객에게 보낼 현장 설명" />
              <div className="quote-lines">
                {quoteLines.map((line, index) => (
                  <div key={`${line.name}-${index}`}>
                    <span>{line.name} × {line.quantity} {line.unit}</span>
                    <strong>{won(line.quantity * line.unitPrice)}</strong>
                    <button type="button" onClick={() => setQuoteLines((lines) => lines.filter((_, i) => i !== index))}>삭제</button>
                  </div>
                ))}
                <div className="quote-total"><span>명세서 합계</span><strong>{won(quoteTotal)}</strong></div>
              </div>
              <button type="button" className="primary-button" disabled={busy || readOnly || quoteLines.length === 0} onClick={sendQuote}>
                <FileText size={17} /> 최종 명세서 보내기
              </button>
            </div>

            <SectionTitle title="명세서·결제 상태" />
            <div className="stack small">
              {quotes.length === 0 ? <EmptyState title="보낸 명세서가 없습니다" body="현장 추가금이 있을 때만 고객에게 발송하세요." /> : null}
              {quotes.map((quote) => (
                <article className="list-card vertical" key={quote.id}>
                  <div className="list-card-head">
                    <strong>{won(quote.totalAmount)}</strong>
                    <span className="badge">{statusLabel(quote.status)}</span>
                  </div>
                  <ul className="mini-list">
                    {quote.items.map((item) => <li key={item.id}>{item.name} × {item.quantity} · {won(item.amount)}</li>)}
                  </ul>
                  {quote.status === 'requested' ? <p className="muted">고객 승인과 결제 확인 대기 중입니다.</p> : null}
                  {quote.status === 'paid' ? <p className="muted"><CreditCard size={14} /> 추가금 결제 확인 완료</p> : null}
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function PhotoUploadButton({
  label,
  kind,
  disabled,
  onUpload,
}: {
  label: string;
  kind: OrderPhoto['kind'];
  disabled: boolean;
  onUpload: (kind: OrderPhoto['kind'], file?: File) => void;
}) {
  const inputId = `photo-${kind}`;
  return (
    <div className="photo-upload-button">
      <button type="button" className="secondary-button" disabled={disabled} onClick={() => onUpload(kind)}>
        <CameraIcon size={17} /> {label}
      </button>
      <label htmlFor={inputId} className={disabled ? 'disabled' : ''}>파일 선택</label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        capture="environment"
        disabled={disabled}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) onUpload(kind, file);
          e.currentTarget.value = '';
        }}
      />
    </div>
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

import type {
  AndonLivePayload,
  AttendanceRow,
  AuthSessionResponse,
  AuthSessionUser,
  BootstrapPayload,
  DailyPlanRow,
  EmployeeAttSummary,
  JobTravelerDto,
  MachineInfo,
  MachineLoadSummary,
  MealConfig,
  OperationMeta,
  Payroll3PRow,
  ProductCostingSummary,
  ProductMeta,
  ProductionLogDto,
  PurchaseOrderInfo,
  QcInspectionDto,
  ReportSubmitPayload,
  ScheduleBlock,
  SyncOutboxItem,
  TraceabilityDto,
  WeeklyReportData,
  WorkerDto,
} from '@shared/types';
import seedDataRaw from '../../../data/seed_gcck_1233.json';
import {
  computeEmployeeMonthlyStats,
  computeMonthDows,
  computeMonthly3PPayroll,
  DEFAULT_MEAL_CONFIG,
} from '@shared/attendanceParser';
import { computeMachineLoads } from '@shared/loadBalancing';
import { calculateTurnPayroll } from '@shared/payrollEngine';
import { submitDirectToGoogleAppsScript } from './clientBootstrapFallback';

const seed = seedDataRaw as any;

export interface DailyDateMeta {
  workDate: string;
  rowCount: number;
  workerCount: number;
}

export function isStaticDeployment(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    host.endsWith('github.io') ||
    window.location.protocol === 'file:' ||
    host.includes('pages.dev') ||
    host.includes('netlify.app') ||
    host.includes('vercel.app')
  );
}

// ==================== STORAGE HELPERS ====================
function getStoredJson<T>(key: string, defaultVal: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultVal;
  } catch {
    return defaultVal;
  }
}

function setStoredJson(key: string, val: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // ignore
  }
}

// Master Workers list
export function getStaticWorkers(): WorkerDto[] {
  return (seed.workers || []).map((w: any) => ({
    id: w.id,
    name: w.name,
    username: w.username || w.id.toLowerCase(),
    role: w.role || 'THO',
    appRole: (w.id === 'NV00053' ? 'ADMIN' : 'WORKER') as any,
    title: w.title || 'Thợ tiện CNC',
    salaryMode: w.salaryMode || 'KHOAN',
    baseSalary: w.baseSalary || 400000,
    costPerSec: w.costPerSec || 13.89,
    chatId: w.chatId || '',
    isLinked: !!w.isLinked,
    isActive: 1,
  }));
}

// Master Products list
export function getStaticProducts(): ProductMeta[] {
  const map = new Map<string, ProductMeta>();
  (seed.operations || []).forEach((op: any) => {
    if (op.spId && !map.has(op.spId)) {
      map.set(op.spId, {
        spId: op.spId,
        productName: op.opName ? `${op.spId} - ${op.opName}` : op.spId,
        customer: 'VICO Thắng Lợi',
        opCount: 1,
      });
    }
  });
  return Array.from(map.values());
}

// ==================== ATTENDANCE & PAYROLL 3P ====================
export function getStaticAttendance(ym: string): {
  yearMonth: string;
  year: number;
  month: number;
  dows: string[];
  mealConfig: MealConfig;
  employees: EmployeeAttSummary[];
} {
  const [yStr, mStr] = ym.split('-');
  const year = Number(yStr) || 2026;
  const month = Number(mStr) || 10;
  const dows = computeMonthDows(year, month);
  const mealConfig: MealConfig = getStoredJson('GCCK_MEAL_CONFIG', DEFAULT_MEAL_CONFIG);

  const storageKey = `GCCK_ATTENDANCE_${ym}`;
  let rawRows: AttendanceRow[] = getStoredJson<AttendanceRow[]>(storageKey, []);

  if (!rawRows || rawRows.length === 0) {
    const seedRows: AttendanceRow[] = seed.attendanceList || [];
    const workers = getStaticWorkers();
    rawRows = workers.map((w) => {
      const match = seedRows.find((s) => s.empId === w.id);
      if (match) {
        return {
          empId: w.id,
          name: w.name,
          workType: match.workType || 'Công',
          defaultShift: match.defaultShift || 'Ca 1',
          yearDaysHist: match.yearDaysHist || [0, 0, 0, 0, 0, 0, 0, 0, 0],
          days: match.days || Array(31).fill(''),
        };
      }
      return {
        empId: w.id,
        name: w.name,
        workType: 'Công',
        defaultShift: w.id === 'NV00053' ? 'Hành chính' : 'Ca 1',
        yearDaysHist: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        days: Array(31).fill(''),
      };
    });
    setStoredJson(storageKey, rawRows);
  }

  const employees = rawRows.map((emp) =>
    computeEmployeeMonthlyStats(emp, year, month, mealConfig)
  );

  return {
    yearMonth: ym,
    year,
    month,
    dows,
    mealConfig,
    employees,
  };
}

export function updateStaticAttendanceCell(
  ym: string,
  empId: string,
  dayIndex: number,
  value: string,
  defaultShift?: string
): { success: boolean; employee: EmployeeAttSummary } {
  const [yStr, mStr] = ym.split('-');
  const year = Number(yStr) || 2026;
  const month = Number(mStr) || 10;
  const mealConfig: MealConfig = getStoredJson('GCCK_MEAL_CONFIG', DEFAULT_MEAL_CONFIG);

  const storageKey = `GCCK_ATTENDANCE_${ym}`;
  let rawRows: AttendanceRow[] = getStoredJson<AttendanceRow[]>(storageKey, []);
  if (!rawRows || rawRows.length === 0) {
    getStaticAttendance(ym);
    rawRows = getStoredJson<AttendanceRow[]>(storageKey, []);
  }

  let emp = rawRows.find((r) => r.empId === empId);
  if (!emp) {
    emp = {
      empId,
      name: empId,
      workType: 'Công',
      defaultShift: defaultShift || 'Ca 1',
      yearDaysHist: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      days: Array(31).fill(''),
    };
    rawRows.push(emp);
  }

  if (defaultShift) emp.defaultShift = defaultShift;
  if (!emp.days) emp.days = Array(31).fill('');
  while (emp.days.length < 31) emp.days.push('');
  if (dayIndex >= 0 && dayIndex < 31) {
    emp.days[dayIndex] = value;
  }

  setStoredJson(storageKey, rawRows);

  const summary = computeEmployeeMonthlyStats(emp, year, month, mealConfig);
  return { success: true, employee: summary };
}

export function batchUpdateStaticAttendance(
  ym: string,
  payload: any
): { success: boolean; count: number } {
  const [yStr, mStr] = ym.split('-');
  const year = Number(yStr) || 2026;
  const month = Number(mStr) || 10;
  const dows = computeMonthDows(year, month);

  const mode = String(payload?.mode || 'DEFAULT_SHIFT');
  const fromDay = Math.max(1, Math.min(31, Number(payload?.fromDay) || 1));
  const toDay = Math.max(fromDay, Math.min(31, Number(payload?.toDay) || 25));
  const val = String(payload?.value || '').toUpperCase();
  const selectedDows: string[] = payload?.dows || ['T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const fillEmpty = payload?.fillEmpty !== false;
  const overwrite = !!payload?.overwrite;
  const empIds: string[] = payload?.empIds || [];

  const storageKey = `GCCK_ATTENDANCE_${ym}`;
  let rawRows: AttendanceRow[] = getStoredJson<AttendanceRow[]>(storageKey, []);
  if (!rawRows || rawRows.length === 0) {
    getStaticAttendance(ym);
    rawRows = getStoredJson<AttendanceRow[]>(storageKey, []);
  }

  let count = 0;
  for (const emp of rawRows) {
    if (empIds.length > 0 && !empIds.includes(emp.empId)) continue;
    if (!emp.days) emp.days = Array(31).fill('');
    while (emp.days.length < 31) emp.days.push('');

    for (let d = fromDay - 1; d < toDay; d++) {
      const dow = dows[d] || '';
      if (!selectedDows.includes(dow)) continue;
      const cur = emp.days[d] || '';
      if (!overwrite && cur !== '') continue;
      if (!fillEmpty && cur === '') continue;

      let nextVal = val;
      if (mode === 'DEFAULT_SHIFT') {
        const def = (emp.defaultShift || 'Ca 1').toLowerCase();
        nextVal = def.includes('hành chính') ? 'X' : def.includes('2') ? 'C2' : def.includes('3') ? 'C3' : 'C1';
      }
      emp.days[d] = nextVal;
      count++;
    }
  }

  setStoredJson(storageKey, rawRows);
  return { success: true, count };
}

export function getStaticPayroll(ym: string): {
  yearMonth: string;
  rows: Payroll3PRow[];
  totalNetPay: number;
} {
  const att = getStaticAttendance(ym);
  const workers = getStaticWorkers();
  const rows = computeMonthly3PPayroll(workers, att.employees, []);
  const totalNetPay = rows.reduce((acc, r) => acc + (r.netPay || 0), 0);
  return {
    yearMonth: ym,
    rows,
    totalNetPay,
  };
}

// ==================== ORDERS & TRAVELER ====================
export function getStaticOrders(): { items: PurchaseOrderInfo[]; deliveries: any[] } {
  const orders: PurchaseOrderInfo[] = getStoredJson('GCCK_ORDERS', seed.ordersList || []);
  return {
    items: orders,
    deliveries: [],
  };
}

export function getStaticJobTraveler(poId: string): JobTravelerDto {
  const orders = getStaticOrders().items;
  const po = orders.find((p) => p.poId.toLowerCase() === poId.toLowerCase()) || orders[0];
  const products = getStaticProducts();
  const product = products.find((p) => p.spId === po.spId) || null;

  const ops: OperationMeta[] = (seed.operations || []).filter(
    (o: any) => o.spId === po.spId || (product && o.spId === product.spId)
  );

  return {
    po,
    product,
    operations: ops.map((op) => ({
      ...op,
      qrPayload: `GCCK|${po.poId}|${op.ncId}`,
      doneOkQty: Math.floor(po.qtyPo * 0.7),
      faiPassed: true,
    })),
    faiRecords: [],
    printedAt: new Date().toISOString(),
  };
}

export function getStaticTraceability(poId: string): TraceabilityDto {
  const traveler = getStaticJobTraveler(poId);
  const poAny = traveler.po as any;
  return {
    po: traveler.po,
    materialInfo: {
      materialLot: poAny.rawLot || 'LOT-VICO-2026-001',
      supplierName: poAny.castSupplier || 'Xưởng Đúc VICO Thắng Lợi',
      castDate: poAny.castDate || '2026-10-10',
      matName: poAny.matName || 'Thép hợp kim SCM440',
    },
    operationsTimeline: traveler.operations.map((op, idx) => ({
      stepOrder: idx + 1,
      ncId: op.ncId,
      opName: op.opName,
      isFinalOp: op.isFinalOp ? 1 : 0,
      totalOk: op.doneOkQty || 0,
      totalRework: 0,
      totalScrap: 0,
      logs: [],
    })),
    qcRecords: [],
    deliveries: [],
  };
}

// ==================== SCHEDULES & LOADS ====================
export function getStaticSchedules(): {
  schedules: ScheduleBlock[];
  loads: MachineLoadSummary[];
} {
  const schedules: ScheduleBlock[] = getStoredJson('GCCK_SCHEDULES', seed.schedules || []);
  const machines: MachineInfo[] = seed.machines || [];
  const orders: PurchaseOrderInfo[] = getStaticOrders().items;
  const ops: OperationMeta[] = seed.operations || [];

  const loads = computeMachineLoads(machines, orders, ops, schedules);
  return {
    schedules,
    loads,
  };
}

// ==================== COSTING P&L ====================
export function getStaticCosting(): {
  items: ProductCostingSummary[];
  summary: {
    totalProducts: number;
    profitCount: number;
    lossCount: number;
    totalNetProfit: number;
  };
} {
  const items: ProductCostingSummary[] = getStoredJson(
    'GCCK_COSTING_LIST',
    seed.costingList || []
  );

  let totalProfit = 0;
  let profitCount = 0;
  let lossCount = 0;

  for (const it of items) {
    const prof = it.unitProfit || 0;
    totalProfit += prof;
    if (prof >= 0) profitCount++;
    else lossCount++;
  }

  return {
    items,
    summary: {
      totalProducts: items.length,
      profitCount,
      lossCount,
      totalNetProfit: totalProfit,
    },
  };
}

// ==================== ANDON LIVE ====================
export function getStaticAndonLive(): AndonLivePayload {
  const machines: MachineInfo[] = seed.machines || [];
  const kpi = seed.kpiSummary || {};

  return {
    serverTime: new Date().toISOString(),
    vietnamDate: new Date().toLocaleDateString('vi-VN'),
    spindleRunPct: 78.5,
    summary: {
      totalMachines: machines.length,
      runningCount: Math.round(machines.length * 0.7),
      setupCount: 2,
      stoppedCount: 1,
      idleCount: Math.round(machines.length * 0.2),
      todayOkQty: Number(kpi.totalOk || 82),
      todayScrapQty: Number(kpi.totalScrap || 0),
    },
    machines: machines.map((m) => ({
      id: m.id,
      name: m.name,
      group: m.group,
      status: (m.status || 'RUNNING') as any,
      currentWorkerName: m.currentWorkerName || 'Hoàng Ngọc Hà',
      currentPoId: m.currentPoId || 'P0485-01',
      currentNcId: m.currentNcId || 'NC098',
      currentProductName: 'ALKTOP 1342 M',
      currentOpName: 'G/c hoàn thiện',
      stopReason: m.stopReason || null,
      isLightsOut: false,
      loadPct: 85,
      isBottleneck: false,
    })),
    urgentOrders: (seed.ordersList || []).slice(0, 5).map((o: any) => ({
      poId: o.poId,
      customer: o.customer,
      productName: o.productName,
      qtyPo: o.qtyPo,
      finishedQty: o.finishedQty || 0,
      remainQty: Math.max(0, (o.qtyPo || 0) - (o.finishedQty || 0)),
      dueDate: o.dueDate || '2026-10-31',
      isOverdue: o.status === 'DELAYED',
      progressPct: Math.round(((o.finishedQty || 0) / Math.max(1, o.qtyPo || 1)) * 100),
      status: o.status || 'IN_PROGRESS',
    })),
    workerLeaderboard: getStaticWorkers().slice(0, 5).map((w, idx) => ({
      rank: idx + 1,
      workerId: w.id,
      workerName: w.name,
      earnedStdHours: 8.5,
      kpiPct: 105,
      okQtyTotal: 65,
    })),
    alertsTicker: [
      'Máy phay OKK1 đã thay dao mới',
      'Đơn hàng P0485-01 hoàn thành FAI',
      'Cân bằng tải xưởng 17 máy đạt 85% công suất',
    ],
  };
}

// ==================== WEEKLY REPORT ====================
export function getStaticWeeklyReport(weekStart?: string): WeeklyReportData {
  const ws = weekStart || '2026-10-26';
  const orders = getStaticOrders().items;

  let totalPlan = 0;
  let totalAct = 0;
  orders.forEach((o) => {
    totalPlan += o.qtyPo || 0;
    totalAct += o.finishedQty || 0;
  });

  return {
    weekStart: ws,
    weekEnd: '2026-10-31',
    weekLabel: 'Tuần 44 / Tháng 10-2026',
    summary: {
      totalPlannedQty: totalPlan,
      totalActualQty: totalAct,
      completionPct: totalPlan > 0 ? Math.round((totalAct / totalPlan) * 100) : 0,
      totalPoActive: orders.length,
      completedPoCount: orders.filter((o) => (o.finishedQty || 0) >= o.qtyPo).length,
      delayedPoCount: orders.filter((o) => o.status === 'DELAYED').length,
    },
    customerStats: [
      {
        customer: 'Win-Win',
        productCount: 12,
        plannedQty: Math.round(totalPlan * 0.6),
        actualQty: Math.round(totalAct * 0.6),
        completionPct: 75,
        poCount: 45,
      },
      {
        customer: 'Hùng HD - XM Hoàng Thạch',
        productCount: 8,
        plannedQty: Math.round(totalPlan * 0.25),
        actualQty: Math.round(totalAct * 0.25),
        completionPct: 68,
        poCount: 22,
      },
      {
        customer: 'Thép HP Dung Quất',
        productCount: 5,
        plannedQty: Math.round(totalPlan * 0.15),
        actualQty: Math.round(totalAct * 0.15),
        completionPct: 82,
        poCount: 14,
      },
    ],
    poStatuses: orders.slice(0, 50).map((o) => ({
      poId: o.poId,
      customer: o.customer,
      productName: o.productName,
      qtyPo: o.qtyPo,
      finishedQty: o.finishedQty || 0,
      wipQty: o.wipQty || 0,
      dueDate: o.dueDate,
      status: o.status || 'IN_PROGRESS',
      isDelayed: o.status === 'DELAYED',
    })),
    workerLaborStats: getStaticWorkers().map((w) => ({
      workerId: w.id,
      workerName: w.name,
      standardShifts: 22,
      otHours: 12,
      sundayHours: 0,
      offDays: 2,
      pDays: 0,
      totalConvertedShifts: 23.5,
      actualCompletedPieces: 150,
    })),
    downtimeIncidents: [],
    customIncidentNotes: [],
    proposals: [],
    nextWeekForecast: {
      duePos: [],
      carryoverBacklogQty: 0,
      carryoverHours: 0,
      totalRequiredHours: 120,
      machineCapacityHours: 160,
      overloadCapacityHours: 0,
      isOverloaded: false,
      outsourceRecommendations: [],
    },
  };
}

// ==================== DISPATCH ALL STATIC CALLS ====================
export function handleStaticMockApi(
  path: string,
  method: string,
  json?: any,
  _body?: any
): any | null {
  const norm = path.replace(/^\/?(api\/v1\/)?/, '/');

  // Auth session
  if (norm === '/auth/session') {
    const activeId = getStoredJson('GCCK_ACTIVE_WORKER_ID', 'NV00053');
    const workers = getStaticWorkers();
    const w = workers.find((x) => x.id === activeId) || workers[0];
    const user: AuthSessionUser = {
      workerId: w.id,
      name: w.name,
      username: w.username,
      role: w.role,
      appRole: w.id === 'NV00053' ? 'ADMIN' : 'WORKER',
      title: w.title,
      salaryMode: w.salaryMode,
      baseSalary: w.baseSalary,
      costPerSec: w.costPerSec,
      isLinked: w.isLinked,
      chatId: w.chatId,
    };
    return {
      authenticated: true,
      authMode: 'DEMO_QUICK',
      user,
      quickSwitchProfiles: workers.map((x) => ({
        workerId: x.id,
        name: x.name,
        role: x.role,
        appRole: x.id === 'NV00053' ? 'ADMIN' : 'WORKER',
        title: x.title,
        salaryMode: x.salaryMode,
      })),
    } as AuthSessionResponse;
  }

  // Auth login
  if (norm === '/auth/login' || norm === '/auth/quick-switch') {
    let targetWorkerId = 'NV00053';
    try {
      if (json && typeof json === 'object') {
        targetWorkerId = String(json.workerId || json.username || targetWorkerId);
      }
    } catch {
      // ignore
    }
    setStoredJson('GCCK_ACTIVE_WORKER_ID', targetWorkerId);
    const workers = getStaticWorkers();
    const w = workers.find((x) => x.id === targetWorkerId) || workers[0];
    const user: AuthSessionUser = {
      workerId: w.id,
      name: w.name,
      username: w.username,
      role: w.role,
      appRole: w.id === 'NV00053' ? 'ADMIN' : 'WORKER',
      title: w.title,
      salaryMode: w.salaryMode,
      baseSalary: w.baseSalary,
      costPerSec: w.costPerSec,
      isLinked: w.isLinked,
      chatId: w.chatId,
    };
    return {
      token: `offline-${targetWorkerId}`,
      user,
      authMode: 'DEMO_QUICK',
    };
  }

  if (norm === '/auth/logout') {
    return { success: true };
  }

  if (norm === '/auth/telegram-link') {
    return { success: true, message: 'Đã liên kết Telegram thành công' };
  }

  // Bootstrap
  if (norm === '/bootstrap') {
    const todayStr = new Date().toISOString().slice(0, 10);
    const isSunday = new Date().getDay() === 0;
    const workers = getStaticWorkers();
    const activeId = getStoredJson('GCCK_ACTIVE_WORKER_ID', 'NV00053');
    const activeWorker = workers.find((w) => w.id === activeId) || workers[0];

    const user: AuthSessionUser = {
      workerId: activeWorker.id,
      name: activeWorker.name,
      username: activeWorker.username,
      role: activeWorker.role,
      title: activeWorker.title,
      salaryMode: activeWorker.salaryMode,
      baseSalary: activeWorker.baseSalary,
      costPerSec: activeWorker.costPerSec,
      appRole: activeWorker.id === 'NV00053' ? 'ADMIN' : 'WORKER',
      isLinked: activeWorker.isLinked,
      chatId: activeWorker.chatId,
    };

    const orders = getStaticOrders().items;

    return {
      user,
      authMode: 'DEMO_QUICK',
      vietnamToday: todayStr,
      isSundayToday: isSunday,
      workers,
      machines: seed.machines || [],
      toolsList: seed.toolsList || [],
      products: getStaticProducts(),
      operations: seed.operations || [],
      ordersList: orders,
      schedules: [],
      machineLoads: [],
      qcInspections: [],
      recentLogs: seed.recentLogs || [],
      todayAccumulated: seed.todayAccumulated || {},
      opDoneMap: seed.opDoneMap || {},
      kpiSummary: {
        totalOk: Number(seed.kpiSummary?.totalOk || 82),
        totalRework: Number(seed.kpiSummary?.totalRework || 1),
        totalScrap: Number(seed.kpiSummary?.totalScrap || 0),
        totalStopMinutes: 0,
        runningMachines: 11,
        bottleneckMachines: 6,
        openOrders: orders.length,
        overdueOrders: 124,
      },
      shiftHandoverAlerts: [],
      config: {
        AUTH_MODE: 'DEMO_QUICK',
        TELEGRAM_BOT_USERNAME: 'gcck_sanluong_2026_bot',
        SECONDS_PER_SHIFT: 28800,
        SECOND_MACHINE_RATE: 0.33,
        MEAL_SHIFT_2_3: 20000,
        MEAL_OT_2H: 15000,
        MEAL_SUNDAY: 30000,
        KPI_WARNING_THRESHOLD: 0.85,
        WEB_APP_URL:
          'https://script.google.com/macros/s/AKfycbx3YEacwHuxAdYb2yN1qckG4tmydnmmK4f8C_KVtQmUWmpBvJYUh_Jc1DrFZpTeM-bruQ/exec',
      },
    } as BootstrapPayload;
  }

  // Attendance
  const attMatch = /^\/attendance\/(\d{4}-\d{2})$/.exec(norm);
  if (attMatch && method === 'GET') {
    return getStaticAttendance(attMatch[1]);
  }

  const attCellMatch = /^\/attendance\/(\d{4}-\d{2})\/cell$/.exec(norm);
  if (attCellMatch && (method === 'PUT' || method === 'POST')) {
    const ym = attCellMatch[1];
    return updateStaticAttendanceCell(
      ym,
      json?.empId || '',
      Number(json?.dayIndex ?? 0),
      String(json?.value ?? ''),
      json?.defaultShift
    );
  }

  const attBatchMatch = /^\/attendance\/(\d{4}-\d{2})\/batch$/.exec(norm);
  if (attBatchMatch && method === 'POST') {
    return batchUpdateStaticAttendance(attBatchMatch[1], json);
  }

  // Payroll
  const payMatch = /^\/payroll(-3p)?\/(\d{4}-\d{2})$/.exec(norm);
  if (payMatch && method === 'GET') {
    return getStaticPayroll(payMatch[2]);
  }

  // Orders
  if (norm === '/orders' && method === 'GET') {
    return getStaticOrders();
  }

  if (norm === '/orders' && method === 'POST') {
    const orders = getStaticOrders().items;
    const newOrder: PurchaseOrderInfo = {
      ...json,
      poId: json.poId || `PO-${Date.now().toString().slice(-4)}`,
      status: json.status || 'IN_PROGRESS',
      finishedQty: 0,
      wipQty: 0,
    };
    orders.unshift(newOrder);
    setStoredJson('GCCK_ORDERS', orders);
    return { success: true, order: newOrder };
  }

  const orderPatchMatch = /^\/orders\/([^/]+)$/.exec(norm);
  if (orderPatchMatch && method === 'PATCH') {
    const poId = decodeURIComponent(orderPatchMatch[1]);
    const orders = getStaticOrders().items;
    const idx = orders.findIndex((o) => o.poId.toLowerCase() === poId.toLowerCase());
    if (idx >= 0) {
      orders[idx] = { ...orders[idx], ...json };
      setStoredJson('GCCK_ORDERS', orders);
      return { success: true, order: orders[idx] };
    }
    return { success: true };
  }

  const travelerMatch = /^\/(orders\/([^/]+)\/traveler|job-traveler\/([^/]+))$/.exec(norm);
  if (travelerMatch && method === 'GET') {
    const poId = decodeURIComponent(travelerMatch[2] || travelerMatch[3]);
    return getStaticJobTraveler(poId);
  }

  const traceMatch = /^\/traceability\/([^/]+)$/.exec(norm);
  if (traceMatch && method === 'GET') {
    const poId = decodeURIComponent(traceMatch[1]);
    return getStaticTraceability(poId);
  }

  // Schedules & Loads
  if (norm.startsWith('/schedules') && method === 'GET') {
    if (norm.includes('/daily/dates') || norm.includes('/daily-dates')) {
      return { success: true, dates: [] as DailyDateMeta[] };
    }
    if (norm.includes('/daily')) {
      return { success: true, rows: [] as DailyPlanRow[] };
    }
    return getStaticSchedules();
  }

  if (norm === '/schedules' && method === 'POST') {
    const schedules = getStoredJson<ScheduleBlock[]>('GCCK_SCHEDULES', []);
    const newSb: ScheduleBlock = {
      ...json,
      id: Date.now(),
      status: json.status || 'PLANNED',
    };
    schedules.push(newSb);
    setStoredJson('GCCK_SCHEDULES', schedules);
    return { success: true, schedule: newSb };
  }

  if (norm.startsWith('/schedules/') && (method === 'PATCH' || method === 'DELETE')) {
    return { success: true };
  }

  if (norm === '/schedules/quick-fill' && method === 'POST') {
    return { message: 'Đã tự động cân bằng tải điều độ 17 máy thành công' };
  }

  // Costing
  if (norm === '/costing' && method === 'GET') {
    return getStaticCosting();
  }

  if (norm.startsWith('/costing/') && method === 'PATCH') {
    return { success: true, item: json };
  }

  // Logs & QC
  if (norm.startsWith('/logs') && method === 'GET') {
    return { items: getStoredJson('GCCK_LOGS', seed.recentLogs || []) };
  }

  if (norm.startsWith('/logs/') && method === 'PATCH') {
    return { success: true, item: json };
  }

  if (norm === '/qc' && method === 'GET') {
    return { items: getStoredJson('GCCK_QC', []) };
  }

  if (norm === '/qc' && method === 'POST') {
    const qcList = getStoredJson<QcInspectionDto[]>('GCCK_QC', []);
    const newQc: QcInspectionDto = {
      ...json,
      id: Date.now(),
      inspectionDate: new Date().toISOString(),
    };
    qcList.unshift(newQc);
    setStoredJson('GCCK_QC', qcList);
    return { success: true, inspection: newQc };
  }

  // Reports
  if (norm.startsWith('/reports/weekly') && method === 'GET') {
    return getStaticWeeklyReport();
  }

  if (norm.startsWith('/reports/weekly')) {
    return { success: true };
  }

  // TV Andon Live
  if (norm === '/andon/live' && method === 'GET') {
    return getStaticAndonLive();
  }

  // Master & Config
  if (norm === '/config' && method === 'GET') {
    return {
      config: getStoredJson('GCCK_CONFIG', {
        AUTH_MODE: 'DEMO_QUICK',
        TELEGRAM_BOT_USERNAME: 'gcck_sanluong_2026_bot',
        SECONDS_PER_SHIFT: 28800,
        SECOND_MACHINE_RATE: 0.33,
        MEAL_SHIFT_2_3: 20000,
        MEAL_OT_2H: 15000,
        MEAL_SUNDAY: 30000,
        KPI_WARNING_THRESHOLD: 0.85,
      }),
    };
  }

  if (norm === '/config' && (method === 'PUT' || method === 'PATCH')) {
    const cur = getStoredJson('GCCK_CONFIG', {});
    const next = { ...cur, ...json };
    setStoredJson('GCCK_CONFIG', next);
    return { success: true, config: next };
  }

  if (norm === '/sync/outbox' && method === 'GET') {
    return { items: [] as SyncOutboxItem[] };
  }

  if (norm === '/sync/flush' && method === 'POST') {
    return { flushedCount: 0 };
  }

  // Report submit & payroll preview
  if (norm === '/reports/calculate-payroll' && method === 'POST') {
    const calc = calculateTurnPayroll({
      workerId: json.workerId || 'NV00053',
      salaryMode: 'KHOAN',
      costPerSec: 13.89,
      workDate: json.workDate || new Date().toISOString().slice(0, 10),
      shiftType: json.shiftType || 'Ca 1',
      startTime: json.startTime || '06:00',
      endTime: json.endTime || '14:00',
      overtimeMinutes: json.overtimeMinutes || 0,
      machineName: json.machineName || 'M01',
      machineMode: json.isSecondMachine ? 'SECOND' : 'FIRST',
      machineCostPerHour: 50000,
      stdSeconds: json.stdSeconds || 120,
      stdEdgesPerPcs: 1,
      costPerEdge: 5000,
      okQty: json.okQty || 0,
      reworkQty: json.reworkQty || 0,
      scrapQty: json.scrapQty || 0,
      stopMinutes: json.stopMinutes || 0,
    });
    return { payroll: calc, warnings: [] };
  }

  if (norm === '/reports/submit' && method === 'POST') {
    void submitDirectToGoogleAppsScript(json as ReportSubmitPayload);
    return {
      success: true,
      logId: Date.now(),
      recordUid: json.recordUid,
      syncedWithSheets: true,
      message: 'Đã ghi nhận báo cáo và đồng bộ Google Apps Script',
    };
  }

  // Master operations, machines, workers
  if (norm.startsWith('/operations') || norm.startsWith('/machines') || norm.startsWith('/workers')) {
    return { success: true, items: [] };
  }

  return null;
}

import type {
  AuthSessionResponse,
  AuthSessionUser,
  BootstrapPayload,
  OperationMeta,
  ProductMeta,
  QuickSwitchProfile,
  ReportSubmitPayload,
  WorkerDto,
} from '@shared/types';
import seedDataRaw from '../../../data/seed_gcck_1233.json';

const GAS_WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbx3YEacwHuxAdYb2yN1qckG4tmydnmmK4f8C_KVtQmUWmpBvJYUh_Jc1DrFZpTeM-bruQ/exec';

const seed = seedDataRaw as any;

export function getStaticFallbackBootstrap(selectedWorkerId?: string): BootstrapPayload {
  const todayStr = new Date().toISOString().slice(0, 10);
  const isSunday = new Date().getDay() === 0;

  const workers: WorkerDto[] = (seed.workers || []).map((w: any) => ({
    id: w.id,
    name: w.name,
    role: w.role,
    title: w.title,
    salaryMode: w.salaryMode,
    baseSalary: w.baseSalary,
    costPerSec: w.costPerSec,
    chatId: w.chatId || '',
    isLinked: !!w.isLinked,
    username: w.username,
  }));

  const activeWorker = workers.find((w) => w.id === selectedWorkerId) || workers[2] || workers[0];

  const user: AuthSessionUser | null = activeWorker
    ? {
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
      }
    : null;

  // Extract products from operations
  const productMap = new Map<string, ProductMeta>();
  (seed.operations || []).forEach((op: any) => {
    if (op.spId && !productMap.has(op.spId)) {
      productMap.set(op.spId, {
        spId: op.spId,
        productName: op.opName ? `${op.spId} - ${op.opName}` : op.spId,
        customer: 'VICO',
        opCount: 1,
      });
    }
  });

  return {
    user,
    authMode: 'DEMO_QUICK',
    vietnamToday: todayStr,
    isSundayToday: isSunday,
    workers,
    machines: seed.machines || [],
    toolsList: seed.toolsList || [],
    products: Array.from(productMap.values()),
    operations: (seed.operations || []) as OperationMeta[],
    ordersList: seed.ordersList || [],
    schedules: [],
    machineLoads: [],
    qcInspections: [],
    recentLogs: (seed.recentLogs || []).slice(0, 50),
    todayAccumulated: seed.todayAccumulated || {},
    opDoneMap: seed.opDoneMap || {},
    kpiSummary: {
      totalOk: Number(seed.kpiSummary?.totalOk || 0),
      totalRework: Number(seed.kpiSummary?.totalRework || 0),
      totalScrap: Number(seed.kpiSummary?.totalScrap || 0),
      totalStopMinutes: 0,
      runningMachines: (seed.machines || []).length,
      bottleneckMachines: 0,
      openOrders: (seed.ordersList || []).length,
      overdueOrders: 0,
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
      WEB_APP_URL: GAS_WEB_APP_URL,
    },
  };
}

export function getStaticFallbackSession(workerId?: string): AuthSessionResponse {
  const bootstrap = getStaticFallbackBootstrap(workerId);
  const quickSwitchProfiles: QuickSwitchProfile[] = bootstrap.workers.map((w) => ({
    workerId: w.id,
    name: w.name,
    role: w.role,
    title: w.title,
    salaryMode: w.salaryMode,
    appRole: w.id === 'NV00053' ? 'ADMIN' : 'WORKER',
  }));

  return {
    authenticated: true,
    user: bootstrap.user,
    authMode: 'DEMO_QUICK',
    quickSwitchProfiles,
  };
}

export async function submitDirectToGoogleAppsScript(payload: ReportSubmitPayload): Promise<boolean> {
  try {
    const bootstrap = getStaticFallbackBootstrap(payload.workerId);
    const worker = bootstrap.workers.find((w) => w.id === payload.workerId);
    const op = bootstrap.operations.find((o) => o.ncId === payload.ncId);

    const hasOt = Number(payload.overtimeMinutes || 0) > 0;
    const otHours = Math.round((Number(payload.overtimeMinutes || 0) / 60) * 10) / 10;

    const gasPayload = {
      record_id: payload.recordUid,
      date: payload.workDate || new Date().toISOString().slice(0, 10),
      shift: payload.shiftType || 'Ca 1',
      worker_id: payload.workerId || '',
      worker: worker?.name || payload.workerId || '',
      machine: payload.machineName,
      po: payload.poId || '',
      product: op?.spId || '',
      product_code: op?.spId || '',
      op: payload.ncId,
      qty_dat: payload.okQty || 0,
      qty_xuly: payload.reworkQty || 0,
      qty_huy: payload.scrapQty || 0,
      responsibility: payload.defectType ? `Lỗi: ${payload.defectType}` : 'Không có lỗi',
      scrap_reason: payload.defectType || '',
      photos: payload.photoBase64 ? [payload.photoBase64] : [],
      product_photos: [],
      has_overtime: hasOt,
      overtime_hours: otHours,
      overtime_reason: 'Tăng ca tiến độ xưởng',
      start_time: payload.startTime,
      end_time: payload.endTime,
    };

    // Use fetch with no-cors so Google Apps Script redirects don't block in browsers
    await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gasPayload),
    });

    return true;
  } catch (err) {
    console.error('Lỗi đẩy trực tiếp lên Google Apps Script:', err);
    return false;
  }
}

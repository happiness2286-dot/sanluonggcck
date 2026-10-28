import type {
  PayrollCalcResult,
  ProductionLogDto,
  ReportSubmitPayload,
  ReportSubmitResponse,
} from '@shared/types';
import { apiFetch, ApiError } from './apiClient';
import { submitDirectToGoogleAppsScript } from './clientBootstrapFallback';

const OUTBOX_STORAGE_KEY = 'GCCK_OFFLINE_OUTBOX_V1';
const OUTBOX_EVENT_NAME = 'gcck:outbox-changed';

export interface QueuedOfflineReport {
  recordUid: string;
  queuedAt: string;
  payload: ReportSubmitPayload;
  attempts: number;
  lastError?: string;
}

function emitOutboxChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OUTBOX_EVENT_NAME));
  }
}

export function getOfflineOutbox(): QueuedOfflineReport[] {
  try {
    const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOfflineOutbox(items: QueuedOfflineReport[]): void {
  try {
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(items));
    emitOutboxChanged();
  } catch {
    // ignore storage errors
  }
}

export function generateIdempotentRecordUid(ncId: string = 'NC'): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8).toUpperCase()
      : Math.random().toString(36).slice(2, 10).toUpperCase();
  return `GCCK-${datePart}-${ncId}-${randPart}`;
}

export function enqueueOfflineReport(payload: ReportSubmitPayload): QueuedOfflineReport {
  const recordUid = payload.recordUid || generateIdempotentRecordUid(payload.ncId || 'NC');
  const enrichedPayload: ReportSubmitPayload = { ...payload, recordUid };
  const items = getOfflineOutbox();
  const existingIdx = items.findIndex((i) => i.recordUid === recordUid);

  const entry: QueuedOfflineReport = {
    recordUid,
    queuedAt: new Date().toISOString(),
    payload: enrichedPayload,
    attempts: existingIdx >= 0 ? items[existingIdx].attempts : 0,
  };

  if (existingIdx >= 0) {
    items[existingIdx] = entry;
  } else {
    items.push(entry);
  }
  saveOfflineOutbox(items);
  return entry;
}

export function removeOfflineReport(recordUid: string): void {
  const filtered = getOfflineOutbox().filter((i) => i.recordUid !== recordUid);
  saveOfflineOutbox(filtered);
}

let isFlushing = false;

export async function flushOfflineOutbox(): Promise<{ synced: number; remaining: number }> {
  if (isFlushing) {
    return { synced: 0, remaining: getOfflineOutbox().length };
  }
  const items = getOfflineOutbox();
  if (items.length === 0) return { synced: 0, remaining: 0 };

  isFlushing = true;
  let synced = 0;
  const remainingItems: QueuedOfflineReport[] = [];

  try {
    for (const item of items) {
      try {
        await apiFetch<ReportSubmitResponse>('/api/v1/reports', {
          method: 'POST',
          json: item.payload,
          timeoutMs: 12000,
        });
        synced++;
      } catch {
        // Also attempt direct sync to Google Apps Script as secondary channel
        const gasOk = await submitDirectToGoogleAppsScript(item.payload);
        if (gasOk) {
          synced++;
        } else {
          remainingItems.push({
            ...item,
            attempts: item.attempts + 1,
            lastError: 'Chờ kết nối mạng',
          });
        }
      }
    }
    saveOfflineOutbox(remainingItems);
    return { synced, remaining: remainingItems.length };
  } finally {
    isFlushing = false;
  }
}

export async function submitReportWithOfflineFallback(
  payload: ReportSubmitPayload
): Promise<{ queuedOffline: boolean; response?: ReportSubmitResponse; queuedItem?: QueuedOfflineReport }> {
  const recordUid = payload.recordUid || generateIdempotentRecordUid(payload.ncId || 'NC');
  const finalPayload: ReportSubmitPayload = { ...payload, recordUid };

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const queuedItem = enqueueOfflineReport(finalPayload);
    return { queuedOffline: true, queuedItem };
  }

  try {
    const response = await apiFetch<ReportSubmitResponse>('/api/v1/reports', {
      method: 'POST',
      json: finalPayload,
    });
    return { queuedOffline: false, response };
  } catch (err: any) {
    // If backend is down or 404 (e.g. running on GitHub Pages), push directly to Google Apps Script
    const gasSuccess = await submitDirectToGoogleAppsScript(finalPayload);
    const queuedItem = enqueueOfflineReport(finalPayload);

    if (gasSuccess) {
      // Remove from outbox if Google Apps Script already confirmed receipt
      removeOfflineReport(recordUid);

      const mockLog: Partial<ProductionLogDto> = {
        id: Date.now(),
        recordUid,
        createdAt: new Date().toISOString(),
        timeStr: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        workDate: finalPayload.workDate || new Date().toISOString().slice(0, 10),
        shiftType: finalPayload.shiftType || 'Ca 1',
        startTime: finalPayload.startTime,
        endTime: finalPayload.endTime,
        overtimeMinutes: finalPayload.overtimeMinutes || 0,
        isSunday: finalPayload.isSunday ? 1 : 0,
        isLightsOut: finalPayload.isLightsOut ? 1 : 0,
        workerId: finalPayload.workerId || '',
        workerName: finalPayload.workerId || '',
        machineId: finalPayload.machineName,
        machineName: finalPayload.machineName,
        machineMode: 'FIRST',
        poId: finalPayload.poId || '',
        spId: '',
        customer: 'VICO',
        productName: '',
        ncId: finalPayload.ncId,
        opName: finalPayload.ncId,
        stage: 'GC',
        stepOrder: 1,
        isFinalOp: 1,
        stdSeconds: 60,
        okQty: finalPayload.okQty || 0,
        reworkQty: finalPayload.reworkQty || 0,
        scrapQty: finalPayload.scrapQty || 0,
        defectType: finalPayload.defectType || '',
        damageValue: finalPayload.damageValue || 0,
        stopMinutes: 0,
        stopReason: '',
        toolCode: '',
        edgesUsed: 0,
        income: 0,
        qcStatus: 'PENDING_QC',
        isVoided: 0,
      };

      const mockPayroll: Partial<PayrollCalcResult> = {
        effectiveMachineMode: 'FIRST',
        machRate: 1,
        shiftMult: 1,
        isSunday: false,
        effectiveOtMinutes: finalPayload.overtimeMinutes || 0,
        unpaidOtMinutes: 0,
        effectivePaidStopMinutes: 0,
        isMonthlyStaff: false,
        unitPiecePrice: 0,
        earnedStdSeconds: 0,
        netWorkSeconds: 28800,
        basePieceWage: 0,
        otBonusWage: 0,
        waitWage: 0,
        pieceWage: 0,
        directPieceIncome: 0,
        mealAllowance: 0,
        scrapPenalty: 0,
        turnTotalIncome: 0,
        costingLaborCost: 0,
        costingMachCost: 0,
        costingToolCost: 0,
        costingScrapLoss: 0,
        batchCost: 0,
        kpiPct: 100,
      };

      return {
        queuedOffline: false,
        response: {
          success: true,
          deduplicated: false,
          message: `Đã gửi trực tiếp lên Google Sheet thành công (${recordUid}).`,
          warnings: [],
          log: mockLog as ProductionLogDto,
          payroll: mockPayroll as PayrollCalcResult,
          todayTotalIncome: 0,
        },
      };
    }

    if (err instanceof ApiError && (err.status === 0 || err.status === 404)) {
      return { queuedOffline: true, queuedItem };
    }
    throw err;
  }
}

export function subscribeOfflineOutbox(onUpdate: (items: QueuedOfflineReport[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => onUpdate(getOfflineOutbox());
  const onlineHandler = () => {
    void flushOfflineOutbox();
  };
  window.addEventListener(OUTBOX_EVENT_NAME, handler);
  window.addEventListener('storage', handler);
  window.addEventListener('online', onlineHandler);
  return () => {
    window.removeEventListener(OUTBOX_EVENT_NAME, handler);
    window.removeEventListener('storage', handler);
    window.removeEventListener('online', onlineHandler);
  };
}

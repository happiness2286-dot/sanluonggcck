import type {
  AndonLivePayload,
  AttendanceRow,
  AuthSessionResponse,
  AuthSessionUser,
  BootstrapPayload,
  CuttingTool,
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
  ShiftHandoverAlert,
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

// ==================== SAMPLE HANDOVER ALERTS ====================
export const sampleHandoverAlerts: ShiftHandoverAlert[] = [
  {
    id: 1,
    machineName: 'Máy phay OKK1',
    workerName: 'Hoàng Ngọc Hà',
    workDate: '25/10/2026',
    shiftType: 'Ca 1',
    poId: 'PO-THEO-KH',
    productName: 'TL XL 93A',
    opName: 'G/c phay Mp ht',
    handoverNote: 'Dao phay mặt mới thay cạnh số 2, chạy êm.',
    createdAt: '2026-10-25 14:05:00',
  },
  {
    id: 2,
    machineName: 'Máy tiện FUJI',
    workerName: 'Hoàng Ngọc Hà',
    workDate: '27/10/2026',
    shiftType: 'Ca 2',
    poId: 'PO-THEO-KH',
    productName: 'Búa đập loại máy nghiền đứng VHC-111 theo bv: VHC-20102',
    opName: 'G/c làm định vị',
    handoverNote: 'Gá kẹp chuẩn đồng tâm <0.02mm, chú ý phôi cuộn ở lỗ định vị.',
    createdAt: '2026-10-27 22:10:00',
  },
];

// ==================== SAMPLE SCHEDULE BLOCKS ====================
export const sampleSchedules: ScheduleBlock[] = [
  {
    id: 1,
    machineId: 'M20',
    machineName: 'Máy Khoan cần Yoshida',
    poId: 'PO-MAU-VF',
    ncId: 'NC050',
    productName: 'Mẫu Thử — G/c cắt dây',
    opName: 'G/c cắt dây',
    matName: 'Thép C45 / S45C',
    toolCode: 'T05',
    workDate: '2026-10-27',
    shiftType: 'Ca 2 (Chiều 14h-22h)',
    plannedQty: 16,
    plannedHours: 8.0,
    isLightsOut: 0,
    sequenceOrder: 1,
    status: 'PLANNED',
    note: 'Kế hoạch điều độ Lean SMED',
  },
  {
    id: 2,
    machineId: 'M07',
    machineName: 'Máy Phay CNC1',
    poId: 'PO485-01',
    ncId: 'NC098',
    productName: 'ALKTOP 1342 M',
    opName: 'G/c hoàn thiện',
    matName: 'Inox SUS304 / SUS316',
    toolCode: 'T01',
    workDate: '2026-10-28',
    shiftType: 'Ca 3 (Đêm 22h-06h)',
    plannedQty: 24,
    plannedHours: 7.5,
    isLightsOut: 1,
    sequenceOrder: 1,
    status: 'RUNNING',
    note: '🌙 Chạy tự động Lights-out ban đêm (phôi lớn chu kỳ dài)',
  },
  {
    id: 3,
    machineId: 'M02',
    machineName: 'Máy Tiện CNC 1',
    poId: 'PO485-02',
    ncId: 'NC103',
    productName: 'ALKTOP 2155 H',
    opName: 'G/c tiện hoàn thiện',
    matName: 'Thép hợp kim SCM440',
    toolCode: 'T03',
    workDate: '2026-10-28',
    shiftType: 'Ca 1 (Sáng 06h-14h)',
    plannedQty: 20,
    plannedHours: 8.0,
    isLightsOut: 0,
    sequenceOrder: 1,
    status: 'RUNNING',
    note: 'Chạy ưu tiên đơn hàng gấp',
  },
  {
    id: 4,
    machineId: 'M03',
    machineName: 'Máy Tiện CNC 2',
    poId: 'PO486-01',
    ncId: 'NC096',
    productName: 'ALKTOP 1135 M',
    opName: 'G/c hoàn thiện',
    matName: 'Thép SKD11',
    toolCode: 'T02',
    workDate: '2026-10-28',
    shiftType: 'Ca 2 (Chiều 14h-22h)',
    plannedQty: 18,
    plannedHours: 8.0,
    isLightsOut: 0,
    sequenceOrder: 2,
    status: 'PLANNED',
    note: 'Gá kẹp phôi đúc VICO',
  },
  {
    id: 5,
    machineId: 'M21',
    machineName: 'Máy cưa băng',
    poId: 'PO480-01',
    ncId: 'NC298',
    productName: 'ISHIZUE 318Dw650',
    opName: 'G/c Cưa hoàn thiện',
    matName: 'Gang / Hợp kim Cr chịu mài mòn',
    toolCode: 'T10',
    workDate: '2026-10-28',
    shiftType: 'Ca 3 (Đêm 22h-06h)',
    plannedQty: 12,
    plannedHours: 7.5,
    isLightsOut: 1,
    sequenceOrder: 1,
    status: 'RUNNING',
    note: '🌙 Đề xuất Ca 3 Lights-out cưa tự động',
  },
  {
    id: 6,
    machineId: 'M01',
    machineName: 'Máy tiện OKUMA',
    poId: 'DH-388',
    ncId: 'NC622',
    productName: 'TL XL 93A',
    opName: 'G/c phay Mp ht',
    matName: 'Thép C45 / S45C',
    toolCode: 'T04',
    workDate: '2026-10-28',
    shiftType: 'Ca 1 (Sáng 06h-14h)',
    plannedQty: 15,
    plannedHours: 8.0,
    isLightsOut: 0,
    sequenceOrder: 1,
    status: 'RUNNING',
    note: 'Dao phay mặt thay cạnh số 2',
  },
  {
    id: 7,
    machineId: 'M08',
    machineName: 'Máy Phay CNC2',
    poId: 'PO486-02',
    ncId: 'NC104',
    productName: 'ALKTOP 2681 H',
    opName: 'Gia công phay CNC',
    matName: 'Thép SKD11',
    toolCode: 'T01',
    workDate: '2026-10-28',
    shiftType: 'Ca 3 (Đêm 22h-06h)',
    plannedQty: 10,
    plannedHours: 7.5,
    isLightsOut: 1,
    sequenceOrder: 1,
    status: 'PLANNED',
    note: '🌙 Chạy tự động ban đêm',
  },
];

// ==================== SAMPLE PRODUCTION LOGS ====================
export const sampleProductionLogs: ProductionLogDto[] = [
  {
    id: 1,
    recordUid: 'LOG-20261028-0915-01',
    timeStr: '09:15',
    workDate: '2026-10-28',
    shiftType: 'Ca 1 (06:00-14:00)',
    startTime: '06:00',
    endTime: '14:00',
    overtimeMinutes: 0,
    isSunday: 0,
    isLightsOut: 0,
    workerId: 'NV00053',
    workerName: 'Hoàng Ngọc Hà',
    machineId: 'M01',
    machineName: 'Máy tiện OKUMA',
    machineMode: 'SECOND',
    poId: 'P0485-01',
    spId: 'SP050',
    customer: 'Win-Win',
    productName: 'ALKTOP 1342 M',
    ncId: 'NC098',
    opName: 'G/c hoàn thiện',
    stage: '1',
    stepOrder: 1,
    isFinalOp: 0,
    stdSeconds: 480,
    okQty: 63,
    reworkQty: 0,
    scrapQty: 0,
    defectType: '',
    damageValue: 0,
    stopMinutes: 0,
    stopReason: '',
    toolCode: 'T03',
    edgesUsed: 13.86,
    selfCheckOk: 1,
    qcStatus: 'PASSED',
    pieceWage: 157500,
    otBonusWage: 0,
    waitWage: 0,
    mealAllowance: 0,
    scrapPenalty: 0,
    income: 157500,
    directPieceIncome: 157500,
    batchCost: 157500,
    kpiPct: 105,
    kpiStatus: 'PASSED',
    photoUrl: '',
    handoverNote: '',
    materialLot: 'LOT-VICO-2610-001',
    isVoided: 0,
    note: '',
    createdAt: '2026-10-28 09:15:00',
  },
  {
    id: 2,
    recordUid: 'LOG-20261025-2332-01',
    timeStr: '23:32',
    workDate: '2026-10-25',
    shiftType: 'Ca 1 (06:00-14:00)',
    startTime: '06:00',
    endTime: '14:00',
    overtimeMinutes: 0,
    isSunday: 1,
    isLightsOut: 0,
    workerId: 'NV00053',
    workerName: 'Hoàng Ngọc Hà',
    machineId: 'M09',
    machineName: 'Máy phay OKK1',
    machineMode: 'FIRST',
    poId: 'PO-THEO-KH',
    spId: 'SP329',
    customer: 'Hùng HD - XM Hoàng Thạch',
    productName: 'TL XL 93A',
    ncId: 'NC622',
    opName: 'G/c phay Mp ht (End)',
    stage: 'End',
    stepOrder: 1,
    isFinalOp: 1,
    stdSeconds: 2400,
    okQty: 11,
    reworkQty: 1,
    scrapQty: 0,
    defectType: 'Lệch tâm 0.03mm',
    damageValue: 0,
    stopMinutes: 0,
    stopReason: '',
    toolCode: 'T04',
    edgesUsed: 2,
    selfCheckOk: 1,
    qcStatus: 'PASSED',
    pieceWage: 110000,
    otBonusWage: 0,
    waitWage: 0,
    mealAllowance: 30000,
    scrapPenalty: 0,
    income: 140000,
    directPieceIncome: 110000,
    batchCost: 110000,
    kpiPct: 92,
    kpiStatus: 'PASSED',
    photoUrl: '',
    handoverNote: 'Dao phay mặt mới thay cạnh số 2, chạy êm.',
    materialLot: 'LOT-VICO-2610-002',
    isVoided: 0,
    note: '',
    createdAt: '2026-10-28 09:15:00',
  },
  {
    id: 3,
    recordUid: 'LOG-20261027-1609-01',
    timeStr: '16:09',
    workDate: '2026-10-27',
    shiftType: 'Ca 1 (06:00-14:00)',
    startTime: '06:00',
    endTime: '14:00',
    overtimeMinutes: 0,
    isSunday: 0,
    isLightsOut: 0,
    workerId: 'NV00053',
    workerName: 'Hoàng Ngọc Hà',
    machineId: 'M05',
    machineName: 'Máy tiện FUJI',
    machineMode: 'FIRST',
    poId: 'PO-THEO-KH',
    spId: 'SP250',
    customer: 'Taniguchi',
    productName: 'Búa đập loại máy nghiền đứng VHC-111 theo bv: VHC-20102',
    ncId: 'NC158',
    opName: 'G/c làm định vị',
    stage: '1',
    stepOrder: 1,
    isFinalOp: 0,
    stdSeconds: 3600,
    okQty: 8,
    reworkQty: 0,
    scrapQty: 0,
    defectType: '',
    damageValue: 0,
    stopMinutes: 0,
    stopReason: '',
    toolCode: 'T01',
    edgesUsed: 1.5,
    selfCheckOk: 1,
    qcStatus: 'PASSED',
    pieceWage: 120000,
    otBonusWage: 0,
    waitWage: 0,
    mealAllowance: 0,
    scrapPenalty: 0,
    income: 120000,
    directPieceIncome: 120000,
    batchCost: 120000,
    kpiPct: 100,
    kpiStatus: 'PASSED',
    photoUrl: '',
    handoverNote: 'Gá kẹp chuẩn đồng tâm <0.02mm, chú ý phôi cuộn ở lỗ định vị.',
    materialLot: 'LOT-VICO-2610-003',
    isVoided: 0,
    note: '',
    createdAt: '2026-10-28 09:15:00',
  },
];

// ==================== SAMPLE QC INSPECTIONS ====================
export const sampleQcInspections: QcInspectionDto[] = [
  {
    id: 1,
    inspectionType: 'FAI',
    poId: 'PO485-01',
    spId: 'SP050',
    ncId: 'NC098',
    productName: 'ALKTOP 1342 M',
    opName: 'G/c hoàn thiện',
    machineName: 'Máy Tiện CNC 1',
    operatorId: 'NV00053',
    inspectorId: 'NV_KT02',
    inspectorName: 'Nguyễn Văn Duy (NV_KT02)',
    result: 'PASS',
    sampleSize: 1,
    defectQty: 0,
    measuredDimsJson: JSON.stringify({ d1: 134.2, d2: 85.0, ra: 1.6 }),
    rootCause: '',
    correctiveAction: 'Đạt chuẩn chi tiết đầu tiên (FAI), cho phép chạy loạt',
    createdAt: '2026-10-27 08:05:19',
  },
  {
    id: 2,
    inspectionType: 'FAI',
    poId: 'PO485-02',
    spId: 'SP062',
    ncId: 'NC103',
    productName: 'ALKTOP 2155 H',
    opName: 'G/c tiện hoàn thiện',
    machineName: 'Máy Tiện CNC 1',
    operatorId: 'NV00214',
    inspectorId: 'NV_KT02',
    inspectorName: 'Nguyễn Văn Duy (NV_KT02)',
    result: 'PASS',
    sampleSize: 1,
    defectQty: 0,
    measuredDimsJson: JSON.stringify({ d1: 215.5, d2: 110.0, ra: 1.6 }),
    rootCause: '',
    correctiveAction: 'Đạt chuẩn chi tiết đầu tiên (FAI), cho phép chạy loạt',
    createdAt: '2026-10-27 10:15:00',
  },
  {
    id: 3,
    inspectionType: 'FAI',
    poId: 'PO486-01',
    spId: 'SP056',
    ncId: 'NC096',
    productName: 'ALKTOP 1135 M',
    opName: 'G/c hoàn thiện',
    machineName: 'Máy Tiện CNC 2',
    operatorId: 'NV00216',
    inspectorId: 'NV_KT02',
    inspectorName: 'Nguyễn Văn Duy (NV_KT02)',
    result: 'PASS',
    sampleSize: 1,
    defectQty: 0,
    measuredDimsJson: JSON.stringify({ d1: 113.5, ra: 1.6 }),
    rootCause: '',
    correctiveAction: 'Đạt chuẩn FAI',
    createdAt: '2026-10-27 14:20:00',
  },
  {
    id: 4,
    inspectionType: 'FAI',
    poId: 'PO480-01',
    spId: 'SP030',
    ncId: 'NC047',
    productName: 'ISHIZUE 318Dw650',
    opName: 'G/c tiện hoàn thiện',
    machineName: 'Máy Tiện CNC 1',
    operatorId: 'NV00218',
    inspectorId: 'NV_KT02',
    inspectorName: 'Nguyễn Văn Duy (NV_KT02)',
    result: 'PASS',
    sampleSize: 1,
    defectQty: 0,
    measuredDimsJson: JSON.stringify({ d1: 318.0, l: 650.0 }),
    rootCause: '',
    correctiveAction: 'Đạt chuẩn chi tiết đầu tiên',
    createdAt: '2026-10-27 16:45:00',
  },
  {
    id: 5,
    inspectionType: 'FAI',
    poId: 'DH-388',
    spId: 'SP329',
    ncId: 'NC622',
    productName: 'TL XL 93A',
    opName: 'G/c phay Mp ht',
    machineName: 'Máy phay OKK1',
    operatorId: 'NV00053',
    inspectorId: 'NV_KT02',
    inspectorName: 'Nguyễn Văn Duy (NV_KT02)',
    result: 'PASS',
    sampleSize: 1,
    defectQty: 0,
    measuredDimsJson: JSON.stringify({ d1: 93.0 }),
    rootCause: '',
    correctiveAction: 'Đạt chuẩn FAI',
    createdAt: '2026-10-28 08:30:00',
  },
];

// ==================== SAMPLE DAILY PLAN 54 ROWS ====================
export function generateSampleDailyRows(workDate: string = '2026-10-21'): DailyPlanRow[] {
  const workers = getStaticWorkers();
  const rows: DailyPlanRow[] = [];
  let stt = 1;

  for (const w of workers) {
    const isManager = w.id === 'NV00053';
    const shiftType = isManager ? 'Ca Hành chính' : 'Ca 2';

    // Row 1
    rows.push({
      id: stt,
      workDate,
      shiftType,
      stt: stt++,
      workerName: w.name,
      customer: 'Win-Win',
      spId: 'SP050',
      productName: 'ALKTOP 1342 M',
      ncId: 'NC098',
      opName: 'G/c hoàn thiện',
      plannedQty: 24,
      machineName: isManager ? 'Máy tiện OKUMA' : 'Máy Tiện CNC 1',
      note: 'Ưu tiên đơn hàng Win-Win',
      actualQty: 24,
      status: 'COMPLETED',
    });

    // Row 2
    rows.push({
      id: stt,
      workDate,
      shiftType,
      stt: stt++,
      workerName: w.name,
      customer: 'Win-Win',
      spId: 'SP062',
      productName: 'ALKTOP 2155 H',
      ncId: 'NC103',
      opName: 'G/c tiện hoàn thiện',
      plannedQty: 18,
      machineName: isManager ? 'Máy Tiện CNC 1' : 'Máy Tiện CNC 2',
      note: 'Gá kẹp chuẩn đồng tâm',
      actualQty: 16,
      status: 'IN_PROGRESS',
    });

    // Row 3
    rows.push({
      id: stt,
      workDate,
      shiftType,
      stt: stt++,
      workerName: w.name,
      customer: 'Hùng HD - XM Hoàng Thạch',
      spId: 'SP329',
      productName: 'TL XL 93A',
      ncId: 'NC622',
      opName: 'G/c phay Mp ht',
      plannedQty: 12,
      machineName: 'Máy phay OKK1',
      note: 'Thay dao mới chạy êm',
      actualQty: 0,
      status: 'PLANNED',
    });
  }

  return rows;
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
function normalizePoId(id: string): string {
  return (id || '').trim().toUpperCase().replace(/^P[0O]/i, 'PO');
}

function normalizeProductName(name: string): string {
  return (name || '').trim().replace(/\s+/g, '').toUpperCase();
}

export function getStaticOrders(): { items: PurchaseOrderInfo[]; deliveries: any[] } {
  const rawOrders: any[] = getStoredJson('GCCK_ORDERS', seed.ordersList || []);
  const qcList = getStoredJson<QcInspectionDto[]>('GCCK_QC', sampleQcInspections);

  const faiMap = new Map<string, string>();
  for (const f of qcList) {
    if (f.inspectionType === 'FAI' && !faiMap.has(f.poId)) {
      faiMap.set(normalizePoId(f.poId), f.result);
    }
  }

  const items: PurchaseOrderInfo[] = rawOrders.map((o) => {
    const qtyPo = Number(o.qtyPo || 0);
    const normId = normalizePoId(o.poId);
    const faiRes = faiMap.get(normId);

    let faiStatus: any = 'NOT_REQUIRED';
    if (qtyPo >= 5) {
      if (faiRes === 'PASS' || faiRes === 'CONCESSION') {
        faiStatus = 'FAI_PASSED';
      } else if (faiRes === 'SCRAP' || faiRes === 'REWORK') {
        faiStatus = 'FAI_FAILED';
      } else {
        faiStatus = 'PENDING_FAI';
      }
    }

    return {
      ...o,
      faiStatus,
    };
  });

  return {
    items,
    deliveries: [],
  };
}

export function getStaticJobTraveler(poId: string): JobTravelerDto {
  const orders = getStaticOrders().items;
  const targetNorm = normalizePoId(poId);
  const rawPo =
    orders.find((p) => normalizePoId(p.poId) === targetNorm) ||
    orders.find((p) => p.poId === 'PO485-01') ||
    orders[0];

  const targetProd = normalizeProductName(rawPo.productName);

  const allOps: any[] = seed.operations || [];
  const matchedOps = allOps.filter((o: any) => {
    if (o.spId && rawPo.spId && o.spId === rawPo.spId) return true;
    if (o.productName && rawPo.productName) {
      return normalizeProductName(o.productName) === targetProd;
    }
    return false;
  });

  const opsList =
    matchedOps.length > 0
      ? matchedOps
      : allOps.filter((o: any) => (o.productName || '').includes('ALKTOP 1342 M'));

  const totalSteps = opsList.length;

  const costingList: any[] = seed.costingList || [];
  const matchCosting = costingList.find(
    (c: any) => normalizeProductName(c.productName) === targetProd
  );
  const spId = matchCosting?.spId || rawPo.spId || 'SP050';

  const mappedOps = opsList.map((op: any, idx: number) => {
    const stepOrder = idx + 1;
    const isFinalOp = idx === totalSteps - 1 ? 1 : 0;
    const opAscii = (op.opName || '').toLowerCase();
    const isCriticalCheck =
      isFinalOp === 1 ||
      opAscii.includes('tinh') ||
      opAscii.includes('cưa') ||
      opAscii.includes('cua') ||
      opAscii.includes('doa') ||
      opAscii.includes('ren')
        ? 1
        : 0;

    const isAlktopSample = rawPo.productName.includes('ALKTOP 1342');
    const doneOkQty = isAlktopSample
      ? idx === 0
        ? 63
        : 0
      : Math.floor(rawPo.qtyPo * (isFinalOp === 1 ? 0.9 : 0.6));

    return {
      ...op,
      spId,
      stepOrder,
      isFinalOp,
      stage: isFinalOp === 1 ? 'End' : String(stepOrder),
      isCriticalCheck,
      defaultMachine: op.defaultMachine || 'Máy Tiện CNC 1',
      qrPayload: `GCCK|${rawPo.poId}|${op.ncId}`,
      doneOkQty,
      faiPassed: true,
    };
  });

  const product: ProductMeta = {
    spId,
    customer: rawPo.customer || 'Win-Win',
    productName: rawPo.productName,
    matName:
      mappedOps[0]?.matName ||
      'Thép hợp kim SCM440 / SCW480 / 65G (Thép Mangan)',
    opCount: totalSteps,
    setupMinutesStd: 15,
  };

  const poWithMeta: PurchaseOrderInfo = {
    ...rawPo,
    spId,
    materialLot: (rawPo as any).materialLot || (rawPo as any).rawLot || 'LOT-VICO-2610-001',
    supplierName:
      (rawPo as any).supplierName ||
      (rawPo as any).castSupplier ||
      'Xưởng Đúc VICO Thắng Lợi',
    castDate: (rawPo as any).castDate || '2026-10-10',
    faiStatus: 'FAI_PASSED',
  };

  const faiRecords: QcInspectionDto[] = [
    {
      id: 1,
      poId: rawPo.poId,
      ncId: mappedOps[0]?.ncId || 'NC098',
      spId,
      workerId: 'NV_KT02',
      inspectorName: 'Nguyễn Văn Duy (NV_KT02)',
      inspectionType: 'FAI',
      result: 'PASS',
      correctiveAction: 'Đạt chuẩn chi tiết đầu tiên (FAI), cho phép chạy loạt',
      inspectionDate: '2026-10-27 08:05:19',
      notes: 'Đạt chuẩn kích thước bản vẽ',
    } as any,
  ];

  return {
    po: poWithMeta,
    product,
    operations: mappedOps,
    faiRecords,
    printedAt: new Date().toISOString(),
  };
}

export function getStaticTraceability(poId: string): TraceabilityDto {
  const traveler = getStaticJobTraveler(poId);
  const poAny = traveler.po as any;
  return {
    po: traveler.po,
    materialInfo: {
      materialLot: poAny.materialLot || 'LOT-VICO-2610-001',
      supplierName: poAny.supplierName || 'Xưởng Đúc VICO Thắng Lợi',
      castDate: poAny.castDate || '2026-10-10',
      matName:
        traveler.product?.matName ||
        poAny.matName ||
        'Thép hợp kim SCM440 / SCW480 / 65G',
    },
    operationsTimeline: traveler.operations.map((op, idx) => ({
      stepOrder: idx + 1,
      ncId: op.ncId,
      opName: op.opName,
      isFinalOp: op.isFinalOp ? 1 : 0,
      totalOk: op.doneOkQty || 0,
      totalRework: 0,
      totalScrap: 0,
      logs: sampleProductionLogs.filter(
        (l) => l.poId === traveler.po.poId && l.ncId === op.ncId
      ),
    })),
    qcRecords: traveler.faiRecords,
    deliveries: [],
  };
}

// ==================== SCHEDULES & LOADS ====================
export function getStaticSchedules(): {
  schedules: ScheduleBlock[];
  loads: MachineLoadSummary[];
} {
  const schedules: ScheduleBlock[] = getStoredJson('GCCK_SCHEDULES', sampleSchedules);
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
    const schedData = getStaticSchedules();

    return {
      user,
      authMode: 'DEMO_QUICK',
      vietnamToday: todayStr,
      isSundayToday: isSunday,
      workers,
      machines: seed.machines || [],
      toolsList: (seed.toolsList || []) as CuttingTool[],
      products: getStaticProducts(),
      operations: seed.operations || [],
      ordersList: orders,
      schedules: schedData.schedules,
      machineLoads: schedData.loads,
      qcInspections: sampleQcInspections,
      recentLogs: sampleProductionLogs,
      todayAccumulated: { NV00053: 157500 },
      opDoneMap: seed.opDoneMap || { NC098: 63, NC622: 11, NC158: 8 },
      kpiSummary: {
        totalOk: 82,
        totalRework: 1,
        totalScrap: 0,
        totalStopMinutes: 0,
        runningMachines: 11,
        bottleneckMachines: 6,
        openOrders: orders.length,
        overdueOrders: 124,
      },
      shiftHandoverAlerts: sampleHandoverAlerts,
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

  // Traceability & Job Traveler
  if (norm.includes('/traceability') && method === 'GET') {
    const match = /(orders\/([^/]+)\/traceability|traceability\/([^/]+))/.exec(norm);
    const poId = decodeURIComponent(match?.[2] || match?.[3] || 'PO485-01');
    return getStaticTraceability(poId);
  }

  const travelerMatch = /^\/(orders\/([^/]+)\/traveler|job-traveler\/([^/]+))$/.exec(norm);
  if (travelerMatch && method === 'GET') {
    const poId = decodeURIComponent(travelerMatch[2] || travelerMatch[3]);
    return getStaticJobTraveler(poId);
  }

  // Schedules & Loads
  if (norm.includes('/daily-dates') || norm.includes('/daily/dates')) {
    const dates: DailyDateMeta[] = [
      { workDate: '2026-10-21', rowCount: 54, workerCount: 18 },
      { workDate: '2026-10-27', rowCount: 54, workerCount: 18 },
      { workDate: '2026-10-28', rowCount: 54, workerCount: 18 },
    ];
    return { success: true, dates };
  }

  if (norm.includes('/schedules/daily') && method === 'GET') {
    const urlParams = new URLSearchParams(norm.split('?')[1] || '');
    const date = urlParams.get('date') || '2026-10-21';
    const rows = getStoredJson<DailyPlanRow[]>(
      `GCCK_DAILY_PLAN_${date}`,
      generateSampleDailyRows(date)
    );
    return { success: true, workDate: date, rows };
  }

  if (norm.includes('/schedules/daily') && method === 'POST') {
    const date = json?.workDate || json?.date || '2026-10-21';
    const rows = json?.rows || [];
    setStoredJson(`GCCK_DAILY_PLAN_${date}`, rows);
    return { success: true, workDate: date, rowCount: rows.length };
  }

  if (norm.includes('/schedules/daily') && method === 'DELETE') {
    return { success: true };
  }

  if (norm.startsWith('/schedules') && method === 'GET') {
    return getStaticSchedules();
  }

  if (norm === '/schedules' && method === 'POST') {
    const schedules = getStoredJson<ScheduleBlock[]>('GCCK_SCHEDULES', sampleSchedules);
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
    return { items: getStoredJson('GCCK_LOGS', sampleProductionLogs) };
  }

  if (norm.startsWith('/logs/') && method === 'PATCH') {
    return { success: true, item: json };
  }

  if (norm === '/qc' && method === 'GET') {
    return { items: getStoredJson('GCCK_QC', sampleQcInspections) };
  }

  if (norm === '/qc' && method === 'POST') {
    const qcList = getStoredJson<QcInspectionDto[]>('GCCK_QC', sampleQcInspections);
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

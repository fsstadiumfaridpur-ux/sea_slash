import {printStaffSalarySheet} from '../utils/staffSalaryPrint';
import {isViewDate,isViewMonth} from '../utils/viewPreferences';
import {useRememberedViewState} from '../lib/useRememberedViewState';
import {correctAttendanceHourlyRate, staffScheduledHours} from '../utils/staffShiftEarnings';
import {useWorkScheduleHours} from '../lib/useWorkScheduleHours';
import { StaffSalarySheetView } from './StaffSalarySheetView';
import { buildStaffSalarySheet } from '../utils/staffSalarySheet';
import { downloadStaffSalaryExcel } from '../utils/staffSalaryExcel';
import { durationClock } from '../utils/staffShiftEarnings';
import { AttendanceEarningsCells } from './AttendanceEarningsCells';
import { WorkScheduleSettings } from './WorkScheduleSettings';
import { NumericInput } from './NumericInput';
import React, { useEffect, useMemo, useState } from "react";
import {
  Download,
  FileText,
  Plus,
  Pencil,
  KeyRound,
  UserRoundMinus,
  Trash2,
  Printer,
  RefreshCw,
  DollarSign,
  Search,
  X,
} from "lucide-react";
import type {
  StaffMember,
  StaffAttendance,
  StaffAdvance,
  AttendanceStatus,
} from "../types";
import { formatBDT, formatNumber, getTodayString } from "../utils/formatters";
import {
} from "../utils/staffPayroll";
import { StaffProfileModal } from "./StaffProfileModal";
import { StaffAgreements } from "./StaffAgreements";

interface Props {
  isAdmin: boolean;
  expenses: import("../types").MonthlyExpenseItem[];
  onRecordSalary: (staffId: string, month: string) => void;
  staffList: StaffMember[];
  attendanceList: StaffAttendance[];
  advancesList: StaffAdvance[];
  stallName: string;
  loading: boolean;
  loadError: string;
  onReload: () => Promise<void>;
  onUpdateStaff: (staff: StaffMember[]) => void;
  onUpdateAttendance: (attendance: StaffAttendance[]) => Promise<void>;
}

const attendanceStatuses: AttendanceStatus[] = [
  "present",
  "absent",
  "half_day",
  "leave",
];
export function StaffPayrollView({
  isAdmin,
  expenses,
  onRecordSalary,
  staffList,
  attendanceList,
  advancesList,
  stallName,
  loading,
  loadError,
  onReload,
  onUpdateStaff,
  onUpdateAttendance,
}: Props) {
  const [sheetStaffId, setSheetStaffId] = useState<string | null>(null);
  const [exportingSheets, setExportingSheets] = useState(false);
  const today = getTodayString();
  const [earningsNow, setEarningsNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setEarningsNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const [tab, setTab] = useRememberedViewState<"profiles" | "attendance" | "salary" | "agreements">('staff.tab','profiles',value=>['profiles','attendance','salary','agreements'].includes(String(value)));
  const [month, setMonth] = useRememberedViewState('staff.month',today.slice(0,7),isViewMonth);
  const [attendanceDate, setAttendanceDate] = useRememberedViewState('staff.attendanceDate',today,isViewDate);
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{
    staff?: StaffMember;
    mode: "profile" | "login" | "fire" | "delete";
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rateCorrection, setRateCorrection] = useState<{attendanceId: string; hourlyRate: number} | null>(null);
  const scheduledHours=useWorkScheduleHours();
  const active = staffList.filter((s) => s.active && !s.archivedAt);
  const commitment = active.reduce(
    (sum, s) =>
      sum + (s.salaryType === "monthly" ? s.baseSalary : s.baseSalary * 30 * (s.salaryType === "hourly" ? staffScheduledHours(s,scheduledHours) : 1)),
    0,
  );
  const rows = useMemo(
    () =>
      staffList.filter(
        (s) =>
          (filter === "all"
            ? !s.archivedAt
            : filter === "archived"
              ? !!s.archivedAt
              : filter === "active"
                ? s.active && !s.archivedAt
                : !s.active && !s.archivedAt) &&
          `${s.name} ${s.role} ${s.loginEmail || ""}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [staffList, filter, search],
  );
  const salaryRows = staffList.filter(
    (s) =>
      s.joinDate <= `${month}-31` &&
      (!s.terminationDate || s.terminationDate >= `${month}-01`),
  );
  const monthSheets=salaryRows.map(s=>buildStaffSalarySheet(s,attendanceList,advancesList,expenses,month,earningsNow));
  const summary=monthSheets.reduce((sum,sheet)=>sum+sheet.remainingDue,0);
  const totalPaid=monthSheets.reduce((sum,sheet)=>sum+sheet.paid,0);
  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not save payroll changes.",
      );
    } finally {
      setBusy(false);
    }
  };
  const markAttendance = (staff: StaffMember, status: AttendanceStatus | "") =>
    perform(async () => {
      const existing = attendanceList.find(
        (a) => a.staffId === staff.id && a.date === attendanceDate,
      );
      const other = attendanceList.filter(
        (a) => !(a.staffId === staff.id && a.date === attendanceDate),
      );
      await onUpdateAttendance(
        status
          ? [
              ...other,
              {
                ...existing,
                id: existing?.id || `att-${crypto.randomUUID()}`,
                staffId: staff.id,
                date: attendanceDate,
                status,
                advancePaid: existing?.advancePaid || 0,
                overtimeHours: existing?.overtimeHours || 0,
              },
            ]
          : other,
      );
    });
  const printPayslip = (staff: StaffMember) => {
    try {
      const sheet = buildStaffSalarySheet(staff, attendanceList, advancesList, expenses, month, earningsNow);
      printStaffSalarySheet(sheet,stallName);
    } catch (failure) { setError((failure as Error).message); }
  };

  return (
    <div className="space-y-5">
      {isAdmin && rateCorrection && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form role="dialog" aria-modal="true" aria-label="Correct attendance hourly rate" className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 dark:bg-slate-950" onSubmit={event => {
        event.preventDefault();
        void perform(async () => {
          if (!isAdmin) throw new Error('Only administrators can correct salary rates.');
          await onUpdateAttendance(attendanceList.map(record => record.id === rateCorrection.attendanceId ? correctAttendanceHourlyRate(record, rateCorrection.hourlyRate) : record));
          setRateCorrection(null);
        });
      }}>
        <h3 className="text-lg font-semibold">Correct attendance hourly rate</h3>
        <p className="text-sm">{staffList.find(staff => staff.id === attendanceList.find(record => record.id === rateCorrection.attendanceId)?.staffId)?.name} · {attendanceList.find(record => record.id === rateCorrection.attendanceId)?.date}</p>
        <p className="text-sm text-slate-500">Recalculate this day's earnings using the corrected rate. Recorded attendance and working times stay the same. Future attendance uses the staff profile's salary rate.</p>
        <label className="block text-sm">Hourly rate (BDT)<NumericInput required min="0.01" step="0.01" value={rateCorrection.hourlyRate} onChange={event => setRateCorrection({...rateCorrection, hourlyRate:Number(event.target.value)})} className="mt-1 w-full rounded border p-2 dark:bg-slate-900" /></label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={() => setRateCorrection(null)}>Cancel</button><button type="submit" disabled={busy} className="rounded bg-amber-700 px-4 py-2 text-white">{busy ? 'Saving…' : 'Save corrected rate'}</button></div>
      </form></div>}
      {sheetStaffId && staffList.find(staff => staff.id === sheetStaffId) && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div role="dialog" aria-modal="true" aria-label="Monthly staff salary sheet" className="max-h-[90dvh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white p-5 dark:bg-slate-950"><div className="mb-3 flex justify-end"><button type="button" aria-label="Close salary sheet" onClick={() => setSheetStaffId(null)} className="p-2"><X size={20} /></button></div><StaffSalarySheetView sheet={buildStaffSalarySheet(staffList.find(staff => staff.id === sheetStaffId)!,attendanceList,advancesList,expenses,month,earningsNow)} restaurant={stallName} onRecordPayment={() => { onRecordSalary(sheetStaffId,month); setSheetStaffId(null); }} /></div></div>}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Staff & Salary</h2>
        <div className="flex gap-2">
          <button
            title="Reload staff data"
            aria-label="Reload staff data"
            disabled={loading || busy}
            onClick={() => perform(onReload)}
            className="p-2"
          >
            <RefreshCw size={18} />
          </button>
          {isAdmin && <button
            disabled={loading || !!loadError}
            onClick={() => setModal({ mode: "profile" })}
            className="flex items-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            <Plus size={16} />
            Create Staff
          </button>}
        </div>
      </header>
      <WorkScheduleSettings isAdmin={isAdmin} />
      {(error || loadError) && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {error || loadError}
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 border-y border-slate-200 py-4 sm:grid-cols-4 dark:border-slate-800">
        {[
          ["Active staff", active.length],
          [active.some(s => s.salaryType === "hourly") ? "Monthly estimate (30 scheduled days)" : "Monthly commitment (30 days)", formatBDT(commitment)],
          [`Net due / ${month}`, formatBDT(summary)],
          [`Total paid / ${month}`,formatBDT(totalPaid)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {label}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {loading || loadError ? "-" : value}
            </p>
          </div>
        ))}
      </div>
      <nav
        aria-label="Staff views"
        className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-2 dark:border-slate-800"
      >
        {(
          [
            "profiles",
            "attendance",
            "salary",
            "agreements",
          ] as const
        ).map((value) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={`shrink-0 rounded-md px-3 py-2 text-sm capitalize ${tab === value ? "bg-slate-200 font-semibold dark:bg-slate-800" : "text-slate-500 dark:text-slate-400"}`}
          >
            {value}
          </button>
        ))}
      </nav>
      {loading ? (
        <p className="py-6 text-sm text-slate-500">Loading staff...</p>
      ) : (
        !loadError && (
          <>
            {tab === "profiles" && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="relative w-full max-w-xs">
                    <Search
                      size={16}
                      className="absolute left-3 top-3 text-slate-500"
                    />
                    <input
                      aria-label="Search staff"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search staff"
                      className="staff-input pl-9"
                    />
                  </div>
                  <select
                    aria-label="Staff status filter"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="active">Active</option>
                    <option value="fired">Fired / Inactive</option>
                    <option value="all">All non-deleted</option>
                    <option value="archived">Deleted profiles</option>
                  </select>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700">
                      <tr>
                        <th className="p-3">Staff Profile</th>
                        <th className="p-3">Salary</th>
                        <th className="p-3">Login</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((s) => (
                        <tr
                          key={s.id}
                          className="border-b border-slate-200 dark:border-slate-800"
                        >
                          <td className="p-3">
                            <p className="font-semibold">{s.name}</p>
                            <p className="text-xs text-slate-500">{s.role}</p>
                            <p className="mt-1 text-xs capitalize text-slate-500">{s.appRole ?? 'chef'} access</p>
                            <p className="text-xs text-slate-500">
                              {s.phone || "-"} / Joined {s.joinDate}
                            </p>
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            {formatBDT(s.baseSalary)}
                            <p className="text-xs text-slate-500">
                              {s.salaryType}{s.salaryType === "hourly" && s.hourlyWorkSchedule && <span className="block text-xs text-slate-500">{s.hourlyWorkSchedule.start}–{s.hourlyWorkSchedule.end} (Dhaka)</span>}
                            </p>
                          </td>
                          <td className="max-w-56 break-all p-3 text-xs">
                            {s.loginEmail || "Not created"}
                          </td>
                          <td className="p-3">
                            <span
                              className={
                                s.active
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-rose-600 dark:text-rose-400"
                              }
                            >
                              {s.archivedAt
                                ? "Deleted"
                                : s.active
                                  ? "Active"
                                  : "Fired / Inactive"}
                            </span>
                            {s.terminationDate && (
                              <p className="mt-1 text-xs text-slate-500">
                                Last day: {s.terminationDate}
                                <br />
                                {s.terminationReason}
                              </p>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex justify-end gap-1">
                              {isAdmin && !s.archivedAt && (
                                <>
                                  <button
                                    aria-label={`Edit ${s.name}`}
                                    title="Edit profile"
                                    onClick={() =>
                                      setModal({ mode: "profile", staff: s })
                                    }
                                    className="p-2"
                                  >
                                    <Pencil size={16} />
                                  </button>
                                  {s.active && (
                                    <>
                                      <button
                                        aria-label={`Manage login for ${s.name}`}
                                        title={
                                          s.loginEmail
                                            ? "Edit login / reset password"
                                            : "Create login"
                                        }
                                        onClick={() =>
                                          setModal({ mode: "login", staff: s })
                                        }
                                        className="p-2"
                                      >
                                        <KeyRound size={16} />
                                      </button>
                                      <button
                                        aria-label={`Fire ${s.name}`}
                                        title="Fire staff"
                                        onClick={() =>
                                          setModal({ mode: "fire", staff: s })
                                        }
                                        className="p-2 text-rose-600"
                                      >
                                        <UserRoundMinus size={16} />
                                      </button>
                                    </>
                                  )}
                                  <button
                                    aria-label={`Delete ${s.name}`}
                                    title="Delete profile (retain history)"
                                    onClick={() =>
                                      setModal({ mode: "delete", staff: s })
                                    }
                                    className="p-2 text-rose-600"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length === 0 && (
                    <p className="py-8 text-sm text-slate-500">
                      No staff profiles found.
                    </p>
                  )}
                </div>
              </>
            )}
            {tab === "attendance" && (
              <section className="space-y-4">
                <label className="block max-w-52 text-xs font-medium">
                  Attendance Date
                  <input
                    required
                    type="date"
                    max={today}
                    value={attendanceDate}
                    onChange={(e) => setAttendanceDate(e.target.value)}
                    className="staff-input"
                  />
                </label>
                <p className="text-xs text-slate-500">Monthly and daily staff earn by attendance day. Hourly staff earn per recorded working second within scheduled hours. Times use Bangladesh time. Use Reload staff data to fetch the latest check-ins.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700">
                      <tr>
                        <th className="p-3">Staff</th>
                        <th className="p-3">Position</th>
                        <th className="p-3">Attendance</th>
                        <th className="whitespace-nowrap p-3">Check-in Time</th>
                        <th className="whitespace-nowrap p-3">Scheduled Shift</th>
                        <th className="whitespace-nowrap p-3">Paid Work Time</th>
                        <th className="whitespace-nowrap p-3">Shift Earnings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffList
                        .filter(
                          (s) =>
                            s.joinDate <= attendanceDate &&
                            (!s.terminationDate
                              ? s.active
                              : s.terminationDate >= attendanceDate),
                        )
                        .map((s) => (
                          <tr
                            key={s.id}
                            className="border-b border-slate-200 dark:border-slate-800"
                          >
                            <td className="p-3 font-medium">{s.name}</td>
                            <td className="p-3 text-slate-500">{s.role}</td>
                            <td className="p-3">
                              <select
                                disabled={busy}
                                aria-label={`Attendance for ${s.name}`}
                                value={
                                  attendanceList.find(
                                    (a) =>
                                      a.staffId === s.id &&
                                      a.date === attendanceDate,
                                  )?.status || ""
                                }
                                onChange={(e) =>
                                  markAttendance(
                                    s,
                                    e.target.value as AttendanceStatus | "",
                                  )
                                }
                                className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                              >
                                <option value="">Not recorded</option>
                                {attendanceStatuses.map((status) => (
                                  <option key={status} value={status}>
                                    {status === "leave"
                                      ? "Unpaid Leave"
                                      : status === "half_day"
                                        ? "Half Day"
                                        : status === "present"
                                          ? "Present"
                                          : "Absent"}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <AttendanceEarningsCells staff={s} attendance={attendanceList.find(record => record.staffId === s.id && record.date === attendanceDate)} now={earningsNow} onCorrectRate={isAdmin && s.salaryType === 'hourly' ? () => {
                              const record = attendanceList.find(record => record.staffId === s.id && record.date === attendanceDate);
                              if (record) { setError(''); setRateCorrection({attendanceId:record.id, hourlyRate:Math.round((record.salaryPerSecond ?? 0)*3600*100)/100}); }
                            } : undefined} />
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {tab === "salary" && (
              <section className="space-y-4">
                <label className="block max-w-52 text-xs font-medium">
                  Salary Month
                  <input
                    type="month"
                    required
                    value={month}
                    onChange={(e) => { if (e.target.value) setMonth(e.target.value); }}
                    className="staff-input"
                  />
                </label>
                <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Monthly sheets are calculated automatically from attendance, scheduled paid time and all recorded staff payments.</p><button type="button" disabled={exportingSheets || !salaryRows.length} onClick={async () => {
                  setExportingSheets(true); setError('');
                  try { await downloadStaffSalaryExcel(salaryRows.map(staff => buildStaffSalarySheet(staff,attendanceList,advancesList,expenses,month,earningsNow)),stallName); }
                  catch (cause) { setError((cause as Error).message); } finally { setExportingSheets(false); }
                }} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700"><Download size={16} />{exportingSheets ? 'Exporting...' : 'Export All Salary Sheets'}</button></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700">
                      <tr>
                        {[
                          "Staff",
                          "Attendance Days",
                          "Paid Work Time",
                          "Total Salary Earned",
                          "Total Paid Salary",
                          "Salary Still to Pay",
                          "Salary Sheet",
                        ].map((h) => (
                          <th key={h} className="p-3 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {salaryRows.map((s) => {
                        const p = buildStaffSalarySheet(s,attendanceList,advancesList,expenses,month,earningsNow);
                        const paid = p.paid;
                        return (
                          <tr
                            key={s.id}
                            className="border-b border-slate-200 dark:border-slate-800"
                          >
                            <td className="p-3 font-medium">{s.name}</td>
                            <td className="p-3">{p.attendanceDays} <span className="text-xs text-slate-500">({p.halfDays} half)</span></td>
                            <td className="p-3 whitespace-nowrap font-mono">{p.totalSeconds === 0 && p.untimedPaidDays > 0 ? 'Not timed' : durationClock(p.totalSeconds)}{p.untimedPaidDays > 0 && <p className="text-xs text-slate-500">{p.untimedPaidDays} days not timed</p>}</td>
                            <td className="p-3 whitespace-nowrap">
                              {formatBDT(p.earned)}
                            </td>
                            <td className="p-3 whitespace-nowrap font-semibold">
                              {formatBDT(paid)}
                            </td>
                            <td className="p-3 whitespace-nowrap font-semibold">
                              {formatBDT(p.remainingDue)}
                              {p.overpaid > 0 && (
                                <p className="text-xs font-normal text-rose-600">
                                  Paid above earnings: {formatBDT(p.overpaid)}
                                </p>
                              )}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <button type="button" title="View monthly salary sheet" aria-label={`View salary sheet for ${s.name}`} onClick={() => setSheetStaffId(s.id)} className="p-2"><FileText size={16} /></button>
                              <button
                                title="Record salary payment"
                                aria-label={`Record salary payment for ${s.name}`}
                                onClick={() => onRecordSalary(s.id, month)}
                                className="p-2"
                              >
                                <DollarSign size={16} />
                              </button>
                              <button
                                title="Print salary statement"
                                aria-label={`Print payslip for ${s.name}`}
                                onClick={() => printPayslip(s)}
                                className="p-2"
                              >
                                <Printer size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {tab === "agreements" && (
              <StaffAgreements
                staff={staffList}
                restaurant={stallName}
                isAdmin={isAdmin}
              />
            )}
          </>
        )
      )}
      {modal && (
        <StaffProfileModal
          {...modal}
          onClose={() => setModal(null)}
          onSaved={onUpdateStaff}
        />
      )}

    </div>
  );
}

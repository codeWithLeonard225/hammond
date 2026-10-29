"use client";

import React, { useState, useEffect, useMemo } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/app/lib/firebase"; // Using standard firebase export reference
import { useAuth } from "@/app/context/AuthContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const TeacherPayrollReport = () => {
  const { user } = useAuth();

  const schoolId = user?.schoolId || user?.data?.schoolId || "N/A";
  const teacherID = user?.data?.teacherID || user?.teacherID || user?.id;
  const teacherName = user?.data?.teacherName || user?.teacherName || "Teacher";

  const [teacherProfile, setTeacherProfile] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Helper to format time display across all potential formats
  const formatTimeDisplay = (record) => {
    if (record.clockInTime && record.clockOutTime) {
      return `${record.clockInTime} - ${record.clockOutTime}`;
    }
    if (record.clockInTime) {
      return record.clockInTime;
    }
    if (record.time?.toDate) {
      return record.time.toDate().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (record.time && typeof record.time === "string") {
      return record.time;
    }
    return "---";
  };

  // ---------------- 1. FETCH TEACHER PROFILE & ATTENDANCE ----------------
  useEffect(() => {
    const fetchData = async () => {
      if (!teacherID || schoolId === "N/A") return;

      setLoading(true);
      try {
        // Fetch Teacher Details (Salary rates & Academic Start Date)
        const teacherQuery = query(
          collection(db, "Teachers"),
          where("schoolId", "==", schoolId),
          where("teacherID", "==", teacherID)
        );
        const teacherSnapshot = await getDocs(teacherQuery);
        if (!teacherSnapshot.empty) {
          setTeacherProfile(teacherSnapshot.docs[0].data());
        }

        // Fetch Attendance Records
        const attendanceQuery = query(
          collection(db, "StaffAttendance"),
          where("schoolId", "==", schoolId),
          where("teacherID", "==", teacherID)
        );
        const attendanceSnapshot = await getDocs(attendanceQuery);
        const records = attendanceSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setAttendanceHistory(records);
      } catch (error) {
        console.error("Error fetching payroll data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [schoolId, teacherID]);

  // ---------------- 2. PAYROLL & ATTENDANCE CALCULATIONS ----------------
  const monthlyData = useMemo(() => {
    const academicStartDate = teacherProfile?.academicStartDate || null;

    // Filter attendance by selected month & academic start date
    const monthlyAttendance = attendanceHistory.filter((record) => {
      if (!record.date || !record.date.startsWith(selectedMonth)) return false;
      if (academicStartDate && record.date < academicStartDate) return false;
      return true;
    });

    const lateDays = monthlyAttendance.filter(
      (r) => r.status?.trim().toLowerCase() === "late"
    ).length;

    const absentDays = monthlyAttendance.filter(
      (r) => r.status?.trim().toLowerCase() === "absent"
    ).length;

    const presentDays = monthlyAttendance.filter(
      (r) => r.status?.trim().toLowerCase() === "present"
    ).length;

    const salary = Number(teacherProfile?.salary) || 0;
    const lateCostPerDay = Number(teacherProfile?.lateCostPerDay) || 0;
    const absentCostPerDay = Number(teacherProfile?.absentCostPerDay) || 0;

    const lateDeduction = lateDays * lateCostPerDay;
    const absentDeduction = absentDays * absentCostPerDay;
    const totalDeduction = lateDeduction + absentDeduction;
    const netSalary = Math.max(0, salary - totalDeduction);

    return {
      records: monthlyAttendance,
      presentDays,
      lateDays,
      absentDays,
      salary,
      lateCostPerDay,
      absentCostPerDay,
      lateDeduction,
      absentDeduction,
      totalDeduction,
      netSalary,
    };
  }, [attendanceHistory, teacherProfile, selectedMonth]);

  // ---------------- 3. CALENDAR GENERATION LOGIC ----------------
  const calendarInfo = useMemo(() => {
    if (!selectedMonth) return { days: [], firstDayOffset: 0 };
    const [year, month] = selectedMonth.split("-").map(Number);

    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOffset = new Date(year, month - 1, 1).getDay();

    return {
      days: Array.from({ length: daysInMonth }, (_, index) => index + 1),
      firstDayOffset,
    };
  }, [selectedMonth]);

  // Quick lookup map for calendar date statuses
  const calendarMap = useMemo(() => {
    const map = {};
    monthlyData.records.forEach((record) => {
      if (record.date) {
        map[record.date] = record.status?.trim().toLowerCase();
      }
    });
    return map;
  }, [monthlyData.records]);

  // Format month string into readable header
  const formattedMonthName = useMemo(() => {
    if (!selectedMonth) return "";
    const [year, month] = selectedMonth.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }, [selectedMonth]);

  // Helper for calendar cell status styling
  const getCalendarStatusStyle = (status) => {
    switch (status) {
      case "present":
        return "bg-emerald-100 text-emerald-800 border-emerald-200 font-extrabold";
      case "late":
        return "bg-amber-100 text-amber-800 border-amber-200 font-extrabold";
      case "absent":
        return "bg-rose-100 text-rose-800 border-rose-200 font-extrabold";
      case "on leave":
      case "leave":
        return "bg-purple-100 text-purple-800 border-purple-200 font-extrabold";
      case "excused":
        return "bg-blue-100 text-blue-800 border-blue-200 font-extrabold";
      default:
        return "bg-gray-50/60 text-gray-400 border-gray-100";
    }
  };

  // ---------------- 4. FORMAT CURRENCY ----------------
  const formatMoney = (amount) => {
    return new Intl.NumberFormat("en-SL", {
      style: "currency",
      currency: "SLE",
      minimumFractionDigits: 2,
    }).format(amount || 0);
  };

  // ---------------- 5. EXPORT PDF PAYSLIP ----------------
  const exportPDF = () => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("STAFF PAYSLIP REPORT", 14, 15);

    doc.setFontSize(10);
    doc.text(`Staff Name: ${teacherName}`, 14, 23);
    doc.text(`Staff ID: ${teacherID}`, 14, 29);
    doc.text(`Period: ${selectedMonth}`, 14, 35);

    // Summary Table
    autoTable(doc, {
      startY: 42,
      head: [["Description", "Amount / Count"]],
      body: [
        ["Base Salary", formatMoney(monthlyData.salary)],
        [
          `Late Days (${monthlyData.lateDays} d @ ${formatMoney(monthlyData.lateCostPerDay)}/d)`,
          `-${formatMoney(monthlyData.lateDeduction)}`,
        ],
        [
          `Absent Days (${monthlyData.absentDays} d @ ${formatMoney(monthlyData.absentCostPerDay)}/d)`,
          `-${formatMoney(monthlyData.absentDeduction)}`,
        ],
        ["Total Deductions", `-${formatMoney(monthlyData.totalDeduction)}`],
        ["Net Salary Payable", formatMoney(monthlyData.netSalary)],
      ],
      theme: "grid",
      headStyles: { fillColor: [79, 70, 229] },
    });

    // Detailed Log
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [["Date", "Status", "Clock In / Out Time"]],
      body: monthlyData.records.map((r) => [
        r.date,
        r.status || "N/A",
        formatTimeDisplay(r),
      ]),
      styles: { fontSize: 9 },
    });

    doc.save(`Payslip_${teacherName}_${selectedMonth}.pdf`);
  };

  if (loading) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center font-bold text-gray-500 animate-pulse uppercase">
          Calculating Payroll...
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen font-sans">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        {/* HEADER */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-gray-800 uppercase tracking-tight">
              My Payroll & Attendance
            </h1>
            <p className="text-indigo-600 font-bold text-[10px] sm:text-xs uppercase tracking-widest">
              Staff Self-Service Breakdown
            </p>
          </div>
          <div className="bg-indigo-50 px-4 py-2 rounded-2xl border border-indigo-100 text-center">
            <p className="text-[9px] sm:text-[10px] font-black text-indigo-400 uppercase">
              Staff Name
            </p>
            <p className="text-xs sm:text-sm font-bold text-indigo-900">
              {teacherName}
            </p>
          </div>
        </div>

        {/* CONTROLS */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border rounded-xl px-4 py-2 text-sm font-bold bg-white shadow-sm w-full sm:w-auto outline-indigo-600"
          />
          <button
            onClick={exportPDF}
            className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-bold shadow hover:bg-indigo-700 transition-colors w-full sm:w-auto"
          >
            📄 Download Payslip PDF
          </button>
        </div>

        {/* FINANCIAL OVERVIEW STATS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase">
              Base Salary
            </p>
            <p className="text-xl font-black text-gray-800 mt-1">
              {formatMoney(monthlyData.salary)}
            </p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs font-bold text-red-400 uppercase">
              Total Deductions
            </p>
            <p className="text-xl font-black text-red-600 mt-1">
              -{formatMoney(monthlyData.totalDeduction)}
            </p>
          </div>
          <div className="bg-emerald-600 p-5 rounded-2xl text-white shadow-sm">
            <p className="text-xs font-bold text-emerald-200 uppercase">
              Net Payable Salary
            </p>
            <p className="text-xl font-black mt-1">
              {formatMoney(monthlyData.netSalary)}
            </p>
          </div>
        </div>

        {/* MONTHLY ATTENDANCE CALENDAR GRID */}
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-5">
            <div>
              <h2 className="text-sm sm:text-base font-black text-gray-800 uppercase tracking-wide">
                Attendance Calendar
              </h2>
              <p className="text-xs font-bold text-indigo-600 mt-0.5">
                {formattedMonthName}
              </p>
            </div>

            {/* STATUS LEGEND */}
            <div className="flex flex-wrap items-center gap-3 text-[10px] font-extrabold uppercase">
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="text-gray-500">Present</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <span className="text-gray-500">Late</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                <span className="text-gray-500">Absent</span>
              </div>
            </div>
          </div>

          {/* CALENDAR DAYS OF WEEK HEADER */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div
                key={day}
                className="text-[9px] sm:text-xs font-black uppercase text-gray-400 py-1"
              >
                {day}
              </div>
            ))}
          </div>

          {/* CALENDAR GRID CELLS */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {/* Empty padding cells for start-of-month offset */}
            {Array.from({ length: calendarInfo.firstDayOffset }).map(
              (_, index) => (
                <div
                  key={`offset-${index}`}
                  className="h-12 sm:h-16 rounded-2xl bg-gray-50/40 border border-transparent"
                />
              )
            )}

            {/* Active Month Days */}
            {calendarInfo.days.map((day) => {
              const formattedDay = String(day).padStart(2, "0");
              const dateStr = `${selectedMonth}-${formattedDay}`;
              const status = calendarMap[dateStr];
              const statusStyle = getCalendarStatusStyle(status);

              return (
                <div
                  key={day}
                  className={`h-12 sm:h-16 p-1.5 sm:p-2 rounded-2xl border flex flex-col justify-between transition-all ${statusStyle}`}
                >
                  <span className="text-[10px] sm:text-xs font-black">
                    {day}
                  </span>
                  {status && (
                    <span className="text-[7px] sm:text-[9px] uppercase tracking-tighter truncate font-extrabold">
                      {status}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* DETAILED ATTENDANCE TABLE */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 bg-gray-50/50 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              Attendance Records Log
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-400 uppercase font-extrabold">
                  <th className="p-3">Date</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Clock In</th>
                  <th className="p-3">Clock Out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                {monthlyData.records.length > 0 ? (
                  monthlyData.records.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50/50 transition">
                      <td className="p-3 font-semibold">{r.date}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            r.status?.toLowerCase() === "present"
                              ? "bg-emerald-50 text-emerald-600"
                              : r.status?.toLowerCase() === "late"
                              ? "bg-amber-50 text-amber-600"
                              : "bg-red-50 text-red-600"
                          }`}
                        >
                          {r.status || "N/A"}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-emerald-700">
                        {r.clockInTime || "---"}
                      </td>
                      <td className="p-3 font-semibold text-rose-700">
                        {r.clockOutTime || "Not Clocked Out"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="4"
                      className="p-6 text-center text-gray-400 italic"
                    >
                      No attendance records found for this month.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherPayrollReport;
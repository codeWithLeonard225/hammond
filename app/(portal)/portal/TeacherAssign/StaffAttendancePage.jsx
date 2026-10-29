"use client";

import { useCallback, useEffect, useState } from "react";
import { db } from "@/app/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "@/app/context/AuthContext";
import { toast } from "react-toastify";

const getLocalDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getLocalTime = () =>
  new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

const getClockInStatus = (now) => {
  const minutes = now.getHours() * 60 + now.getMinutes();

  const ATTENDANCE_START = 6 * 60 + 30;
  const PRESENT_END = 8 * 60;
  const LATE_END = 8 * 60 + 30;
  const ABSENT_END = 14 * 60;

  if (minutes < ATTENDANCE_START) {
    return {
      status: "Not Started",
      allowed: false,
      reason: "Staff attendance starts at 6:30 AM.",
    };
  }

  if (minutes < PRESENT_END) {
    return { status: "Present", allowed: true, reason: "" };
  }

  if (minutes < LATE_END) {
    return { status: "Late", allowed: true, reason: "" };
  }

  if (minutes < ABSENT_END) {
    return {
      status: "Absent",
      allowed: false,
      reason: "The clock-in period has closed. You have been marked absent.",
    };
  }

  return {
    status: "Absent",
    allowed: false,
    reason: "The attendance period closed at 2:00 PM.",
  };
};

export default function StaffAttendancePage() {
  const { user } = useAuth();

  const schoolId = user?.schoolId || user?.data?.schoolId || "";
  const teacherID = user?.data?.teacherID || user?.teacherID || "";

  const [teacher, setTeacher] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [today, setToday] = useState(getLocalDate);
  const [currentTime, setCurrentTime] = useState(getLocalTime);

  const attendanceRef = useCallback(() => {
    if (!schoolId || !teacherID || !today) return null;

    return doc(
      db,
      "StaffAttendance",
      `${schoolId}_${teacherID}_${today}`
    );
  }, [schoolId, teacherID, today]);

  // Update the date and clock displayed on the page.
  useEffect(() => {
    const timer = setInterval(() => {
      setToday(getLocalDate());
      setCurrentTime(getLocalTime());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Verify the logged-in teacher against Firestore.
  useEffect(() => {
    let active = true;

    const loadTeacher = async () => {
      setIsLoading(true);
      setTeacher(null);

      if (!schoolId || !teacherID) {
        if (active) {
          setIsLoading(false);
          toast.error(
            "Your teacher ID or school ID is missing from your login."
          );
        }
        return;
      }

      try {
        const teacherQuery = query(
          collection(db, "Teachers"),
          where("schoolId", "==", schoolId),
          where("teacherID", "==", teacherID)
        );

        const snapshot = await getDocs(teacherQuery);

        if (!active) return;

        if (snapshot.empty) {
          setTeacher(null);
          toast.error("Your teacher record could not be verified.");
          return;
        }

        const teacherData = snapshot.docs[0].data();

        setTeacher({
          id: snapshot.docs[0].id,
          ...teacherData,
          teacherID,
          schoolId,
        });
      } catch (error) {
        console.error("Teacher verification error:", error);
        if (active) toast.error("Could not verify your teacher account.");
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadTeacher();

    return () => {
      active = false;
    };
  }, [schoolId, teacherID]);

  // Load this teacher's attendance for today.
  useEffect(() => {
    let active = true;

    const loadAttendance = async () => {
      if (!teacher || !schoolId || !teacherID) {
        setAttendance(null);
        return;
      }

      try {
        const ref = attendanceRef();
        if (!ref) return;

        const snapshot = await getDoc(ref);

        if (active) {
          setAttendance(
            snapshot.exists() ? snapshot.data() : null
          );
        }
      } catch (error) {
        console.error("Attendance loading error:", error);
        if (active) toast.error("Could not load today's attendance.");
      }
    };

    loadAttendance();

    return () => {
      active = false;
    };
  }, [teacher, attendanceRef, schoolId, teacherID]);

  const handleAttendance = async (action) => {
    if (!teacher || !schoolId || !teacherID) {
      toast.error("Your teacher account has not been verified.");
      return;
    }

  

    if (isSaving) return;

    setIsSaving(true);

    try {
      const now = new Date();
      const date = getLocalDate();
      const time = getLocalTime();

      // Build the document ID using the authenticated teacher's identity.
      const ref = doc(
        db,
        "StaffAttendance",
        `${schoolId}_${teacherID}_${date}`
      );

      const snapshot = await getDoc(ref);
      const existing = snapshot.exists() ? snapshot.data() : null;

      // Do not overwrite a finalized attendance record.
      if (existing?.isFinal === true) {
        setAttendance(existing);
        toast.error(
          "Today's attendance is finalized. Please contact the school administrator."
        );
        return;
      }

      if (action === "clock-in") {
        if (existing) {
          toast.warning(
            existing.clockOutTime
              ? "You have already clocked out today."
              : "You have already clocked in today."
          );
          setAttendance(existing);
          return;
        }

        const { status, allowed, reason } = getClockInStatus(now);

        // Preserve the existing attendance policy.
        if (status === "Not Started") {
          toast.warning(reason);
          return;
        }

        const teacherName =
          teacher.teacherName || user?.name || "Staff Member";

        if (!allowed) {
          const absentRecord = {
            teacherID,
            teacherName,
            schoolId,
            date,
            clockInTime: null,
            clockOutTime: null,
            status: "Absent",
            note: `${note.trim()} ${reason}`.trim(),
            isManual: false,
            entryType: "self-service",
            isFinal: true,
            finalizedBy: "attendance-policy",
            finalizedAt: serverTimestamp(),
            timestamp: serverTimestamp(),
          };

          await setDoc(ref, absentRecord);

          setAttendance({
            ...absentRecord,
            finalizedAt: null,
            timestamp: null,
          });

          setNote("");
          toast.error(reason);
          return;
        }

        const newRecord = {
          teacherID,
          teacherName,
          schoolId,
          date,
          clockInTime: time,
          clockOutTime: null,
          status,
          note: note.trim(),
          isManual: false,
          entryType: "self-service",
          isFinal: false,
          timestamp: serverTimestamp(),
        };

        await setDoc(ref, newRecord);

        setAttendance({
          ...newRecord,
          timestamp: null,
        });

        setNote("");
        toast.success(`Clock-in successful. Status: ${status}.`);
      }

      if (action === "clock-out") {
        if (!existing) {
          toast.error("You must clock in before clocking out.");
          return;
        }

        if (existing.status === "Absent") {
          toast.error("You are marked absent. Clock-out is not allowed.");
          return;
        }

        if (!existing.clockInTime) {
          toast.error("No clock-in time was found for today.");
          return;
        }

        if (existing.clockOutTime) {
          toast.warning("You have already clocked out today.");
          setAttendance(existing);
          return;
        }

        await updateDoc(ref, {
          clockOutTime: time,
          clockOutNote: note.trim(),
          manuallyClockedOut: false,
          updatedAt: serverTimestamp(),
        });

        setAttendance({
          ...existing,
          clockOutTime: time,
          clockOutNote: note.trim(),
        });

        setNote("");
        toast.success(`Clock-out successful at ${time}.`);
      }
    } catch (error) {
      console.error("Staff attendance error:", error);
      toast.error("Could not save attendance. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const hasClockedIn = Boolean(attendance?.clockInTime);
  const hasClockedOut = Boolean(attendance?.clockOutTime);
  const isFinal = attendance?.isFinal === true;

  return (
    <main className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="mx-auto max-w-xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">
            My Staff Attendance
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Clock in and clock out using your own teacher account.
          </p>
        </header>

        {isLoading ? (
          <div className="rounded-2xl bg-white p-6 text-center shadow">
            <p className="text-gray-600">
              Verifying your teacher account...
            </p>
          </div>
        ) : !teacher ? (
          <div className="rounded-2xl border border-red-200 bg-white p-6">
            <h2 className="font-semibold text-red-700">
              Teacher account not verified
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Please sign in with your teacher account or contact your
              school administrator.
            </p>
          </div>
        ) : (
          <>
            <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-500">
                    Logged-in teacher
                  </p>

                  <h2 className="mt-1 text-xl font-bold text-gray-800">
                    {teacher.teacherName || "Staff Member"}
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Teacher ID: {teacherID}
                  </p>
                </div>

                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                  Verified
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">Today's Date</p>
                  <p className="mt-1 font-semibold text-gray-800">
                    {today}
                  </p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">Current Time</p>
                  <p className="mt-1 font-semibold text-gray-800">
                    {currentTime}
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-5 rounded-2xl bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-bold text-gray-800">
                Today's Attendance
              </h2>

              {attendance ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 p-3">
                    <span className="text-sm text-gray-600">
                      Attendance status
                    </span>

                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${
                        attendance.status === "Present"
                          ? "bg-green-100 text-green-700"
                          : attendance.status === "Late"
                          ? "bg-yellow-100 text-yellow-800"
                          : attendance.status === "Excused"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {attendance.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border p-3">
                      <p className="text-xs text-gray-500">Clock-in</p>
                      <p className="mt-1 font-semibold text-gray-800">
                        {attendance.clockInTime || "--"}
                      </p>
                    </div>

                    <div className="rounded-xl border p-3">
                      <p className="text-xs text-gray-500">Clock-out</p>
                      <p className="mt-1 font-semibold text-gray-800">
                        {attendance.clockOutTime || "--"}
                      </p>
                    </div>
                  </div>

                  {attendance.note && (
                    <div className="rounded-xl border p-3">
                      <p className="text-xs text-gray-500">
                        Attendance note
                      </p>
                      <p className="mt-1 text-sm text-gray-700">
                        {attendance.note}
                      </p>
                    </div>
                  )}

                  {isFinal && (
                    <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                      This attendance record is finalized. Contact your
                      school administrator if it needs correction.
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-3 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
                  You do not have an attendance record for today yet.
                </p>
              )}

              <div className="mt-5">
               <label
  htmlFor="attendance-note"
  className="mb-1 block text-sm font-semibold text-gray-700"
>
  Reason / Note <span className="text-gray-400">(Optional)</span>
</label>

                <textarea
                  id="attendance-note"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Enter a short attendance note..."
                  className="w-full rounded-xl border bg-gray-50 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={isSaving || isFinal}
                />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleAttendance("clock-in")}
                  disabled={
                    isSaving ||
                    hasClockedIn ||
                    hasClockedOut ||
                    isFinal
                  }
                  className="rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "Processing..." : "Clock In"}
                </button>

                <button
                  type="button"
                  onClick={() => handleAttendance("clock-out")}
                  disabled={
                    isSaving ||
                    !hasClockedIn ||
                    hasClockedOut ||
                    isFinal ||
                    attendance?.status === "Absent"
                  }
                  className="rounded-xl bg-gray-800 px-4 py-3 font-semibold text-white hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "Processing..." : "Clock Out"}
                </button>
              </div>

              <p className="mt-4 text-xs leading-5 text-gray-500">
                Attendance starts at 6:30 AM. Clock-in before 8:00 AM is
                Present; from 8:00 AM until 8:30 AM is Late. After 8:30 AM,
                the existing attendance policy marks the record Absent.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
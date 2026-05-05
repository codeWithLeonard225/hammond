"use client";

import { useState, useEffect } from "react";
import { schoollpq } from "@/app/lilschoollpq/schoollpq";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/app/context/AuthContext"; // adjust path
import localforage from "localforage";

// 📦 Localforage instance for attendance
const attendanceStore = localforage.createInstance({ name: "AttendanceCache", storeName: "pupil_attendance" });

// Helper for attendance color
const getAttendanceColor = (status) => {
  switch (status) {
    case "Present": return "bg-green-100 border-green-500 text-green-700";
    case "Absent": return "bg-red-100 border-red-500 text-red-700";
    default: return "bg-gray-100 border-gray-400 text-gray-700";
  }
};

export default function PupilAttendance() {
  const { user } = useAuth();
  const pupilData = user?.role === "pupil" ? user.data : null;

  const schoolId = pupilData?.schoolId || "N/A";
  const selectedPupil = pupilData?.studentID;

  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [currentDateAttendance, setCurrentDateAttendance] = useState(null);

  // -----------------------------
  // FETCH ATTENDANCE (CACHE-FIRST)
  // -----------------------------
  useEffect(() => {
    if (!selectedPupil || schoolId === "N/A") return;
    setLoadingAttendance(true);

    const ATT_CACHE_KEY = `attendance_${schoolId}_${selectedPupil}`;

    const loadAttendance = async () => {
      // Try loading from cache
      try {
        const cachedData = await attendanceStore.getItem(ATT_CACHE_KEY);
        if (cachedData?.data) {
          const sortedRecords = [...cachedData.data].sort((a, b) => b.date.localeCompare(a.date));
          setAttendanceRecords(sortedRecords);
          setCurrentDateAttendance(sortedRecords[0] || null);
        }
      } catch (e) { console.error("Failed to load cached attendance:", e); }

      // Listen to Firestore updates
      const q = query(
        collection(schoollpq, "PupilAttendance"),
        where("studentID", "==", selectedPupil),
        where("schoolId", "==", schoolId)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const records = snapshot.docs.map(doc => doc.data());
        const sortedRecords = records.sort((a, b) => b.date.localeCompare(a.date));
        setAttendanceRecords(sortedRecords);
        setCurrentDateAttendance(sortedRecords[0] || null);
        attendanceStore.setItem(ATT_CACHE_KEY, { timestamp: Date.now(), data: sortedRecords }).catch(e => console.error("Failed to cache attendance:", e));
        setLoadingAttendance(false);
      }, (error) => { console.error(error); setLoadingAttendance(false); });

      return () => unsubscribe();
    };

    loadAttendance();
  }, [selectedPupil, schoolId]);

  if (!pupilData?.studentID) return (
    <div className="text-center p-8 bg-white shadow-xl rounded-2xl max-w-3xl mx-auto">
      <h2 className="text-xl text-red-600 font-bold">Error</h2>
      <p className="text-gray-600 mt-2">Pupil ID not found. Please ensure you are logged in correctly.</p>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white shadow-xl rounded-2xl">
      {/* Latest Attendance Notification */}
      <div className="mb-6 p-4 border rounded-lg shadow-md bg-white">
        <h3 className="text-xl font-bold text-center text-blue-600 mb-3 border-b pb-2">Daily Attendance Status 🔔</h3>
        {loadingAttendance ? <p className="text-center text-blue-500">Fetching latest attendance...</p> :
          currentDateAttendance ? <>
            <div className="flex justify-between items-center">
              <p className="text-lg text-gray-700 font-medium">Attendance for {currentDateAttendance.date}:</p>
              <span className={`inline-flex items-center px-4 py-2 rounded-full text-base font-bold border ${getAttendanceColor(currentDateAttendance.status)}`}>
                {currentDateAttendance.status}
              </span>
            </div>
            {currentDateAttendance.status === "Absent" && <p className="mt-3 text-red-700 text-sm italic text-center font-semibold bg-red-50 p-2 rounded-md">
              ⚠️ The pupil was marked **Absent**. Please contact the school if this is incorrect.
            </p>}
          </> :
          <p className="text-center text-yellow-700">No recent attendance record found for this pupil.</p>
        }
      </div>

      {/* Full Attendance History Table */}
      {attendanceRecords.length > 0 && (
        <div className="mb-6 p-4 border rounded-lg shadow-md bg-white">
          <h3 className="text-xl font-bold text-center text-indigo-700 mb-3 border-b pb-2">Attendance History 📅</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Date</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {attendanceRecords.map((record, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-700">{record.date}</td>
                    <td className="px-4 py-2 text-sm">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${getAttendanceColor(record.status)}`}>
                        {record.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

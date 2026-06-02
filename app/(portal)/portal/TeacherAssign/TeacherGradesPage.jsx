"use client";

import React, { useState, useEffect } from "react";

// ✅ Your Specific Databases
import { db } from "@/app/lib/firebase"; 
import { pupilresult } from "@/app/lilresult/resultFetch";
import { pupilLoginFetch } from "@/app/lilpupil/PupilLogin";
// ✅ Firestore
import {
  collection,
  onSnapshot,
  query,
  where,
  setDoc,
  doc,
  serverTimestamp,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";

// ✅ Auth (Next.js Context)
import { useAuth } from "@/app/context/AuthContext";

// ✅ External Tools (Using standard imports as you requested)
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import localforage from "localforage";

const TeacherGradesPage = () => {
  const { user } = useAuth();
  const schoolId = user?.schoolId;
  const teacherName = user?.data?.teacherName;

  const [assignments, setAssignments] = useState([]);
  const [pupils, setPupils] = useState([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [grades, setGrades] = useState({});
  const [selectedTest, setSelectedTest] = useState("Term 1 T1");
  const [academicYear, setAcademicYear] = useState("");
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [gradeSummary, setGradeSummary] = useState({ filled: 0, empty: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [gradesToDownload, setGradesToDownload] = useState(null);
  const [showDownloadPopup, setShowDownloadPopup] = useState(false);

  const tests = ["Term 1 T1", "Term 1 T2", "Term 2 T1", "Term 2 T2", "Term 3 T1", "Term 3 T2"];

  /** 1. Fetch Latest Year from PupilLoginFetch */
  useEffect(() => {
    const q = query(collection(pupilLoginFetch, "PupilsReg"), orderBy("academicYear", "desc"), limit(1));
    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) setAcademicYear(snapshot.docs[0].data().academicYear);
    });
    return () => unsub();
  }, []);

  /** 2. Fetch Assignments from Main DB */
useEffect(() => {
  if (!teacherName || !schoolId) return;

  const q = query(
    collection(db, "TeacherAssignments"),
    where("teacher", "==", teacherName),
    where("schoolId", "==", schoolId)
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    setAssignments(data);

    if (data.length && !selectedClass) {
      setSelectedClass(data[0].className);
      setSelectedSubject(data[0].subjects[0]);
    }
  });

  return () => unsubscribe();
}, [teacherName, schoolId]);

  /** 3. Sync Pupils via LocalForage */
  useEffect(() => {
    if (!academicYear || assignments.length === 0 || !selectedClass) return;
    const loadData = async () => {
      const teacherClasses = assignments.map(a => a.className);
      const q = query(
        collection(pupilLoginFetch, "PupilsReg"),
        where("class", "in", teacherClasses),
        where("academicYear", "==", academicYear),
        where("schoolId", "==", schoolId)
      );

      onSnapshot(q, async (snapshot) => {
        const pupilsData = snapshot.docs.map(d => ({ id: d.id, studentID: d.id, ...d.data() }));
        await localforage.setItem(`pupils_${schoolId}_${academicYear}`, pupilsData);
        
      const classPupils = pupilsData
  .filter(p => p.class === selectedClass)
  .sort((a, b) =>
    (a.studentName || "")
      .trim()
      .toLowerCase()
      .localeCompare(
        (b.studentName || "")
          .trim()
          .toLowerCase()
      )
  );
        setPupils(classPupils);
        
        const initialGrades = {};
        classPupils.forEach(p => initialGrades[p.studentID] = "");
        setGrades(initialGrades);
      });
    };
    loadData();
  }, [assignments, academicYear, selectedClass, schoolId]);

  /** 4. CHECK SUBMISSION STATUS (OthersDB) */
  useEffect(() => {
    const checkStatus = async () => {
      if (!selectedClass || !selectedSubject || !selectedTest || !academicYear) return;
      const q = query(
        collection(pupilresult, "PupilGrades"),
        where("className", "==", selectedClass),
        where("subject", "==", selectedSubject),
        where("test", "==", selectedTest),
        where("academicYear", "==", academicYear),
         where("schoolId", "==", schoolId)
      );
      const snap = await getDocs(q);
      setAlreadySubmitted(!snap.empty);
    };
    checkStatus();
  }, [selectedClass, selectedSubject, selectedTest, academicYear]);

  /** --- HANDLERS --- */
  const handleGradeChange = (pupilID, value) => {
    setGrades(prev => ({ ...prev, [pupilID]: value }));
  };

  const handleShowPopup = () => {
  const filled = Object.values(grades).filter(v => v !== "" && v !== null).length;
  setGradeSummary({ 
    filled, 
    empty: pupils.length - filled,
    total: pupils.length 
  });
  setShowPopup(true);
};

  const handleSubmitGrades = async () => {
    setSubmitting(true);
    try {
      for (const id in grades) {
        if (grades[id] !== "") {
          await setDoc(doc(collection(pupilresult, "PupilGrades")), {
            pupilID: id,
            className: selectedClass,
            subject: selectedSubject,
            grade: parseFloat(grades[id]),
            test: selectedTest,
            academicYear,
            schoolId,
            teacher: teacherName,
            timestamp: serverTimestamp()
          });
        }
      }
      setGradesToDownload(grades);
      setShowDownloadPopup(true);
      setAlreadySubmitted(true);
      setShowPopup(false);
    } catch (e) {
      alert("Error submitting grades");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadPDF = (data) => {
    const doc = new jsPDF();
    doc.text(`${selectedSubject} - ${selectedTest} - ${selectedClass}`, 10, 10);
    const tableData = pupils.map((p, i) => [i + 1, p.studentName, data[p.studentID] || "N/A"]);
    autoTable(doc, { head: [['#', 'Name', 'Grade']], body: tableData });
    doc.save(`${selectedClass}_Grades.pdf`);
    setShowDownloadPopup(false);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white rounded-2xl shadow-md relative">
      <h2 className="text-2xl font-semibold mb-6 text-center text-gray-800">
        Submit Pupils' Grades ({academicYear || "Loading..."})
      </h2>

      <p className="mb-4 text-gray-700 font-medium">
        Logged in as: <span className="font-semibold">{teacherName}</span>
      </p>

      {/* Test Selector */}
      <div className="mb-4">
        <label className="font-medium text-gray-700">Select Test:</label>
        <select
          value={selectedTest}
          onChange={(e) => setSelectedTest(e.target.value)}
          className="w-full border rounded-md px-3 py-2 mt-1 bg-white"
        >
          {tests.map((test, i) => <option key={i} value={test}>{test}</option>)}
        </select>
      </div>

      {/* Class Tabs */}
      <div className="mb-4 flex gap-2 flex-wrap">
        {assignments.map((a) => (
          <button
            key={a.id}
            onClick={() => { setSelectedClass(a.className); setSelectedSubject(a.subjects[0]); }}
            className={`px-4 py-2 rounded-md ${selectedClass === a.className ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          >
            {a.className}
          </button>
        ))}
      </div>

      {/* Subject Tabs */}
      <div className="mb-4 flex gap-2 flex-wrap">
        {assignments.find(a => a.className === selectedClass)?.subjects.map((sub, i) => (
          <button
            key={i}
            onClick={() => setSelectedSubject(sub)}
            className={`px-4 py-2 rounded-md ${selectedSubject === sub ? "bg-green-600 text-white" : "bg-gray-200"}`}
          >
            {sub}
          </button>
        ))}
      </div>

      {/* Pupils Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-300 rounded-md text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-3 py-2 text-left">#</th>
              <th className="border px-3 py-2 text-left">Student Name</th>
              <th className="border px-3 py-2 text-left">Grade</th>
            </tr>
          </thead>
          <tbody>
            {pupils.map((pupil, index) => (
              <tr key={pupil.id} className="hover:bg-gray-50">
                <td className="border px-3 py-2">{index + 1}</td>
                <td className="border px-3 py-2">{pupil.studentName}</td>
                <td className="border px-3 py-2">
                  <input
                    type="number"
                    value={grades[pupil.studentID] || ""}
                    onChange={(e) => handleGradeChange(pupil.studentID, e.target.value)}
                    className="w-20 border px-2 py-1 rounded-md text-center"
                    disabled={alreadySubmitted || submitting}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={handleShowPopup}
        className={`w-full mt-4 py-2 rounded-md ${alreadySubmitted ? "bg-gray-400" : "bg-green-600 text-white"}`}
        disabled={alreadySubmitted || submitting}
      >
        {alreadySubmitted ? "Grades Already Submitted" : "Submit Grades"}
      </button>

      {/* Confirm Popup */}
      {/* Improved Confirm Submission Popup */}
{showPopup && (
  <div className="fixed inset-0 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm z-50 p-4">
    <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-100 animate-in fade-in zoom-in duration-200">
      
      {/* Header */}
      <div className="bg-gray-50 px-8 py-6 border-b border-gray-100 text-center">
        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight">Confirm Submission</h3>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Review Grade Entry Summary</p>
      </div>

      {/* Stats Body */}
      <div className="p-8 space-y-4">
        <div className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl">
          <span className="text-sm font-bold text-gray-500 uppercase">Total Pupils</span>
          <span className="text-lg font-black text-gray-800">{gradeSummary.total}</span>
        </div>

        <div className="flex justify-between items-center p-4 bg-green-50 rounded-2xl border border-green-100">
          <span className="text-sm font-bold text-green-700 uppercase flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span> Grades Entered
          </span>
          <span className="text-lg font-black text-green-700">{gradeSummary.filled}</span>
        </div>

        <div className="flex justify-between items-center p-4 bg-amber-50 rounded-2xl border border-amber-100">
          <span className="text-sm font-bold text-amber-700 uppercase flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span> Grades Missing
          </span>
          <span className="text-lg font-black text-amber-700">{gradeSummary.empty}</span>
        </div>

        {/* Final Warning */}
        <div className="mt-6 p-4 bg-red-50 rounded-2xl border-l-4 border-red-500">
          <p className="text-[11px] font-bold text-red-700 leading-relaxed uppercase">
            ⚠️ Attention: Once submitted, grades for <span className="underline">{selectedTest}</span> ({academicYear}) cannot be changed.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="px-8 pb-8 flex flex-col gap-3">
        <button 
          onClick={handleSubmitGrades} 
          className="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-2xl shadow-lg transition-all active:scale-95 uppercase tracking-widest text-xs"
        >
          Finalize & Upload
        </button>
        <button 
          onClick={() => setShowPopup(false)} 
          className="w-full bg-white text-gray-400 font-bold py-3 rounded-2xl hover:text-gray-600 transition-colors uppercase tracking-widest text-[10px]"
        >
          Go Back & Edit
        </button>
      </div>
    </div>
  </div>
)}

      {/* Mandatory Download Popup */}
      {showDownloadPopup && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-70 z-20">
          <div className="bg-white p-8 rounded-lg border-4 border-red-500 text-center">
            <h3 className="text-xl font-bold text-red-700">SUBMISSION COMPLETE</h3>
            <p className="mb-4">You must download the audit PDF now.</p>
            <button onClick={() => handleDownloadPDF(gradesToDownload)} className="bg-red-600 text-white px-6 py-3 rounded font-bold">
              ⬇️ DOWNLOAD AUDIT PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherGradesPage;
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { db } from "@/app/lib/firebase";
import { pupilresult } from "@/app/lilresult/resultFetch";

import { collection, query, where, onSnapshot } from "firebase/firestore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";

const YearlyResult = () => {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  
  // 1. EXTRACT PARAMS
  const schoolId = searchParams.get("schoolId") || user?.schoolId || "N/A";
  const schoolName = searchParams.get("schoolName") || "School Report";

  // 2. STATE MANAGEMENT
  const [liveTeacherInfo, setLiveTeacherInfo] = useState(null);
  const [academicYear, setAcademicYear] = useState("");
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [availableClasses, setAvailableClasses] = useState([]);
  const [pupils, setPupils] = useState([]);
  const [allYearGrades, setAllYearGrades] = useState([]);
  const [loading, setLoading] = useState(false);

  // Derived values for Form Teacher Lock
  const isFormTeacher = liveTeacherInfo?.isFormTeacher ?? user?.data?.isFormTeacher;
  const assignedClass = liveTeacherInfo?.assignClass ?? user?.data?.assignClass;

  // --- 3. DATA FETCHING ---

  // 3A. Real-time Teacher Info Fetch
  useEffect(() => {
    if (!user?.data?.teacherID || !schoolId || schoolId === "N/A") return;

    const q = query(
      collection(db, "Teachers"),
      where("teacherID", "==", user.data.teacherID),
      where("schoolId", "==", schoolId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setLiveTeacherInfo({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
      }
    });
    return () => unsubscribe();
  }, [user, schoolId]);

  // 3B. Initial Metadata Fetch (Years & Classes)
  useEffect(() => {
    if (!schoolId || schoolId === "N/A") return;

    const q = query(collection(pupilresult, "PupilGrades"), where("schoolId", "==", schoolId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => doc.data());
      const years = [...new Set(data.map((d) => d.academicYear))].sort().reverse();
      const classes = [...new Set(data.map((d) => d.className))].sort();
      
      setAcademicYears(years);
      if (years.length > 0 && !academicYear) setAcademicYear(years[0]);

      // 🔥 APPLY LOCK LOGIC
      if (isFormTeacher && assignedClass) {
        setSelectedClass(assignedClass);
        setAvailableClasses([assignedClass]);
      } else {
        setAvailableClasses(classes);
        if (classes.length > 0 && !selectedClass) setSelectedClass(classes[0]);
      }
    });
    return () => unsubscribe();
  }, [schoolId, isFormTeacher, assignedClass]);

  // 3C. Fetch Pupils and Grades
  useEffect(() => {
    if (!academicYear || !selectedClass || schoolId === "N/A") return;
    setLoading(true);

    const pQuery = query(
      collection(db, "PupilsReg"), 
      where("schoolId", "==", schoolId), 
      where("academicYear", "==", academicYear), 
      where("class", "==", selectedClass)
    );

    const gQuery = query(
      collection(pupilresult, "PupilGrades"), 
      where("academicYear", "==", academicYear), 
      where("schoolId", "==", schoolId), 
      where("className", "==", selectedClass)
    );

    const unsubPupils = onSnapshot(pQuery, (snapshot) => {
      setPupils(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.studentName.localeCompare(b.studentName)));
    });

    const unsubGrades = onSnapshot(gQuery, (snapshot) => {
      setAllYearGrades(snapshot.docs.map(doc => doc.data()));
      setLoading(false);
    });

    return () => { unsubPupils(); unsubGrades(); };
  }, [academicYear, selectedClass, schoolId]);

// --- 4. YEARLY LOGIC ENGINE ---
const yearlyData = useMemo(() => {
  if (allYearGrades.length === 0 || pupils.length === 0) return { subjects: [], studentMap: {}, summaries: {} };

  const subjects = [...new Set(allYearGrades.map(d => d.subject))].sort();
  const studentMap = {};
  const summaries = {};

  const calculateTermMean = (pId, sub, term) => {
    const t1Key = `${term} T1`;
    const t2Key = `${term} T2`;
    const tests = allYearGrades.filter(g => g.pupilID === pId && g.subject === sub && (g.test === t1Key || g.test === t2Key));
    if (tests.length === 0) return 0;
    const t1 = Number(tests.find(t => t.test === t1Key)?.grade || 0);
    const t2 = Number(tests.find(t => t.test === t2Key)?.grade || 0);
    // 🔥 UPDATED: Summing test grades directly instead of dividing by 2
    return t1 + t2;
  };

  const subjectStandings = {};
  subjects.forEach(sub => {
    const scores = pupils.map(p => {
      const m1 = calculateTermMean(p.studentID, sub, "Term 1");
      const m2 = calculateTermMean(p.studentID, sub, "Term 2");
      const m3 = calculateTermMean(p.studentID, sub, "Term 3");
      // 🔥 UPDATED: Straight summation of all 3 terms instead of dividing by 3
      return { id: p.studentID, avg: m1 + m2 + m3, m1, m2, m3 };
    });
    scores.sort((a, b) => b.avg - a.avg);
    scores.forEach((s, i) => {
      if (i > 0 && s.avg === scores[i - 1].avg) s.rank = scores[i - 1].rank;
      else s.rank = i + 1;
    });
    subjectStandings[sub] = scores;
  });

  const overallScores = pupils.map(pupil => {
    const pId = pupil.studentID;
    const results = {};
    let totalYearlySum = 0;

    subjects.forEach(sub => {
      const data = subjectStandings[sub].find(s => s.id === pId);
      results[sub] = { m1: data.m1, m2: data.m2, m3: data.m3, yearlyMean: data.avg, subRank: data.rank };
      totalYearlySum += data.avg;
    });

    studentMap[pId] = results;
    // Note: If you are summing 6 tests over the year (2 tests per term * 3 terms), 
    // the total maximum points per subject becomes 600 instead of 100.
    const maxPossibleMarks = subjects.length * 600; 
    const percentage = maxPossibleMarks > 0 ? ((totalYearlySum / maxPossibleMarks) * 100).toFixed(1) : 0;
    return { id: pId, total: totalYearlySum, percentage };
  });

  overallScores.sort((a, b) => b.total - a.total);
  overallScores.forEach((s, i) => {
    const rank = i > 0 && s.total === overallScores[i - 1].total ? summaries[overallScores[i - 1].id].rank : i + 1;
    summaries[s.id] = { total: s.total, percentage: s.percentage, rank };
  });

  return { subjects, studentMap, summaries };
}, [allYearGrades, pupils]);

  // --- 5. EXPORT HANDLERS ---
  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });
    const pupilsPerPage = 6; 

    for (let i = 0; i < pupils.length; i += pupilsPerPage) {
      const chunk = pupils.slice(i, i + pupilsPerPage);
      if (i > 0) doc.addPage();

      doc.setFontSize(22).setFont(undefined, 'bold').text(schoolName.toUpperCase(), doc.internal.pageSize.getWidth() / 2, 45, { align: "center" });
      doc.setFontSize(14).setFont(undefined, 'normal').text(`ANNUAL PROGRESS BROAD SHEET - ${selectedClass} (${academicYear})`, doc.internal.pageSize.getWidth() / 2, 75, { align: "center" });

      const head1 = [{ content: "SUBJECTS", styles: { fillColor: [40, 44, 52] } }, ...chunk.map(p => ({ content: p.studentName.toUpperCase(), colSpan: 5, styles: { halign: 'center', fillColor: [63, 81, 181] } }))];
      const head2 = ["", ...chunk.flatMap(() => ["TM1", "TM2", "TM3", "AVG", "POS"])];

      const body = yearlyData.subjects.map(sub => [sub, ...chunk.flatMap(p => {
          const r = yearlyData.studentMap[p.studentID]?.[sub] || {};
          return [r.m1 || 0, r.m2 || 0, r.m3 || 0, r.yearlyMean || 0, r.subRank || "-"];
      })]);

      autoTable(doc, {
        startY: 100,
        head: [head1, head2],
        body: [
          ...body,
          ["TOTAL MARKS", ...chunk.flatMap(p => [{ content: yearlyData.summaries[p.studentID].total, colSpan: 5, styles: { halign: 'center', fontStyle: 'bold' } }])],
          ["ANNUAL RANK", ...chunk.flatMap(p => [{ content: yearlyData.summaries[p.studentID].rank, colSpan: 5, styles: { halign: 'center', textColor: [200, 0, 0], fontSize: 13 } }])]
        ],
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [63, 81, 181] },
        margin: { left: 20, right: 20 }
      });
    }
    doc.save(`${selectedClass}_Annual_BroadSheet.pdf`);
  };

  return (
    <div className="max-w-full mx-auto p-6 bg-white shadow-2xl rounded-3xl border border-gray-100">
      {/* Header UI */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-gray-900">Annual Broad Sheet</h2>
          <p className="text-gray-500 font-medium">{schoolName} • Performance Review</p>
        </div>
        <div className="flex gap-3 items-center">
          {isFormTeacher && (
             <span className="bg-amber-100 text-amber-700 px-4 py-2 rounded-full text-xs font-bold border border-amber-200 uppercase">
                🔒 Lock: {assignedClass}
             </span>
          )}
          <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl font-bold shadow-lg">
            Print Preview
          </button>
          <button onClick={handleExportPDF} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-xl font-bold shadow-lg">
            Export PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 p-6 bg-gray-50 rounded-2xl border border-gray-200">
        <div>
          <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Academic Year</label>
          <select className="w-full border-2 border-gray-200 rounded-xl px-4 py-2" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>
            {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Select Class</label>
          <select 
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-2 disabled:bg-gray-200" 
            value={selectedClass} 
            disabled={isFormTeacher}
            onChange={(e) => setSelectedClass(e.target.value)}
          >
            {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center p-20 text-emerald-700 font-bold">Compiling Annual Records...</div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-2xl shadow-sm">
          <table className="w-full text-center border-collapse">
            <thead className="bg-gray-900 text-white text-[11px] uppercase">
              <tr>
                <th className="p-4 border-r sticky left-0 bg-gray-900 z-30" rowSpan="2">Subject</th>
                {pupils.map(p => (
                  <th key={p.studentID} colSpan="5" className="px-4 py-3 border-b border-r min-w-[180px]">
                    {p.studentName}
                  </th>
                ))}
              </tr>
              <tr className="bg-gray-800 text-[9px]">
                {pupils.map(p => (
                  <React.Fragment key={`subh-${p.studentID}`}>
                    <th className="p-1 border-r">TM 1</th>
                    <th className="p-1 border-r">TM 2</th>
                    <th className="p-1 border-r">TM 3</th>
                    <th className="p-1 border-r bg-emerald-900">AVG</th>
                    <th className="p-1 border-r text-amber-400 font-bold">POS</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="text-[10px] font-medium text-gray-700">
              {yearlyData.subjects.map((sub) => (
                <tr key={sub} className="border-b hover:bg-gray-50 transition">
                  <td className="text-left px-4 py-3 font-bold border-r sticky left-0 bg-white shadow-md">{sub}</td>
                  {pupils.map(p => {
                    const res = yearlyData.studentMap[p.studentID]?.[sub] || {};
                    return (
                      <React.Fragment key={`${p.studentID}-${sub}`}>
                        <td className="p-1 border-r">{res.m1 || 0}</td>
                        <td className="p-1 border-r">{res.m2 || 0}</td>
                        <td className="p-1 border-r">{res.m3 || 0}</td>
                        <td className="p-1 border-r font-black bg-emerald-50 text-emerald-700">{res.yearlyMean || 0}</td>
                        <td className="p-1 border-r font-bold text-rose-600">{res.subRank || "-"}</td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
              
              {/* Totals & Ranks */}
             {/* Yearly Footer Summary Rows */}
<tr className="bg-gray-100 font-bold border-t-2 border-emerald-200">
  <td className="sticky left-0 bg-gray-100 px-4 py-3 border-r text-gray-900 uppercase">Annual Total</td>
  {pupils.map(p => (
    <td key={`tot-annual-${p.studentID}`} colSpan="5" className="border-r text-sm text-emerald-700 bg-gray-50">
      {yearlyData.summaries[p.studentID]?.total}
    </td>
  ))}
</tr>
<tr className="bg-gray-100 font-bold border-t">
  <td className="sticky left-0 bg-gray-100 px-4 py-3 border-r text-gray-900 uppercase">Yearly Percentage</td>
  {pupils.map(p => (
    <td key={`per-annual-${p.studentID}`} colSpan="5" className="border-r text-sm text-emerald-700 bg-gray-50">
      {yearlyData.summaries[p.studentID]?.percentage}%
    </td>
  ))}
</tr>
<tr className="bg-amber-50 font-black border-t-2 border-amber-300">
  <td className="sticky left-0 bg-amber-100 px-4 py-5 border-r text-amber-900 uppercase">Final Annual Rank</td>
  {pupils.map(p => (
    <td key={`pos-annual-${p.studentID}`} colSpan="5" className="border-r text-xl text-rose-600 italic bg-amber-50">
      #{yearlyData.summaries[p.studentID]?.rank}
    </td>
  ))}
</tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default YearlyResult;
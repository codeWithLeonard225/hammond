"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { db } from "@/app/lib/firebase";
import { pupilresult } from "@/app/lilresult/resultFetch";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";

// --- SUBJECT SCHEMAS BY CLASS LEVEL (From Broadsheet Logic) ---
const NURSERY_SUBJECTS = [
    "Mathematics", "Word Building", "Hand writing", "Spelling & Dictation", 
    "E. S. P. S", "Religious Education", "Environmental studies", 
    "Physical Health Education", "Composition", "Rhymes", "Literature", 
    "Creative Practical Arts", "French"
];

const LOWER_PRIMARY_SUBJECTS = [
    "E. S. P. S", "Mathematics", "Agricultural Science", "Physical Health Education", 
    "Religious Moral Education", "Literature", "Home Economics", "Reading & Comprehension", 
    "Spelling & Dictation", "Creative Practical Arts", "Composition", "Hand writing", 
    "Computer Studies", "Civic Education", "Word Building", "Rhymes", 
    "Environmental studies", "French", "Vabal Aptitude", "Quantitative Aptitude"
];

const UPPER_PRIMARY_SUBJECTS = [
    "Language Arts", "Mathematics", "Science", "Social Studies", "Agricultural Science", 
    "Physical Health Education", "Religious Moral Education", "Literature", "Home Economics", 
    "Reading & Comprehension", "Spelling & Dictation", "Creative Practical Arts", 
    "Composition", "Hand writing", "Computer Studies", "Civic Education", "French", 
    "Vabal Aptitude", "Quantitative Aptitude"
];

const getSubjectsForClass = (className) => {
    if (!className) return [];
    const normalized = className.trim();
    const isNursery = [/^Nursery/i].some(regex => regex.test(normalized));
    const isLowerPrimary = [/^Class\s+1/i, /^Class\s+2/i].some(regex => regex.test(normalized));
    const isUpperPrimary = [/^Class\s+3/i, /^Class\s+4/i, /^Class\s+5/i, /^Class\s+6/i].some(regex => regex.test(normalized));

    if (isNursery) return NURSERY_SUBJECTS;
    if (isLowerPrimary) return LOWER_PRIMARY_SUBJECTS;
    if (isUpperPrimary) return UPPER_PRIMARY_SUBJECTS;
    return [];
};

const GradeSheet = () => {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const printStyleRef = useRef(null);

  const schoolId = searchParams.get("schoolId") || user?.schoolId || "N/A";
  const schoolName = searchParams.get("schoolName") || "School Report";

  // --- STATE ---
  const [liveTeacherInfo, setLiveTeacherInfo] = useState(null);
  const [academicYear, setAcademicYear] = useState("");
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [availableClasses, setAvailableClasses] = useState([]);
  const [selectedPupilId, setSelectedPupilId] = useState("");
  const [pupils, setPupils] = useState([]);
  const [classGradesData, setClassGradesData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [classesCache, setClassesCache] = useState([]);

  const isFormTeacher = liveTeacherInfo?.isFormTeacher ?? user?.data?.isFormTeacher;
  const assignedClass = liveTeacherInfo?.assignClass ?? user?.data?.assignClass;

  // --- DATA FETCHING ---
  useEffect(() => {
    if (schoolId === "N/A") return;
    const fetchClasses = async () => {
      const snapshot = await getDocs(
        query(collection(db, "Classes"), where("schoolId", "==", schoolId))
      );
      setClassesCache(snapshot.docs.map((doc) => doc.data()));
    };
    fetchClasses();
  }, [schoolId]);

  useEffect(() => {
    if (!user?.data?.teacherID || schoolId === "N/A") return;
    const q = query(
      collection(db, "Teachers"),
      where("teacherID", "==", user.data.teacherID),
      where("schoolId", "==", schoolId)
    );
    return onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) setLiveTeacherInfo(snapshot.docs[0].data());
    });
  }, [user, schoolId]);

  useEffect(() => {
    if (schoolId === "N/A") return;
    const q = query(collection(pupilresult, "PupilGrades"), where("schoolId", "==", schoolId));
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => doc.data());
      const years = [...new Set(data.map((d) => d.academicYear))].sort().reverse();
      const classes = [...new Set(data.map((d) => d.className))].sort();

      setAcademicYears(years);
      if (years.length > 0 && !academicYear) setAcademicYear(years[0]);

      if (isFormTeacher && assignedClass) {
        setSelectedClass(assignedClass);
        setAvailableClasses([assignedClass]);
      } else {
        setAvailableClasses(classes);
        if (classes.length > 0 && !selectedClass) setSelectedClass(classes[0]);
      }
    });
  }, [schoolId, isFormTeacher, assignedClass]);

  useEffect(() => {
    if (!academicYear || !selectedClass || schoolId === "N/A") return;
    setLoading(true);

    const pQ = query(
      collection(db, "PupilsReg"),
      where("schoolId", "==", schoolId),
      where("academicYear", "==", academicYear),
      where("class", "==", selectedClass)
    );
    const gQ = query(
      collection(pupilresult, "PupilGrades"),
      where("academicYear", "==", academicYear),
      where("schoolId", "==", schoolId),
      where("className", "==", selectedClass)
    );

    const unsubP = onSnapshot(pQ, (snap) => {
      const loadedPupils = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => a.studentName.localeCompare(b.studentName));
      setPupils(loadedPupils);
      if (loadedPupils.length > 0 && !selectedPupilId) {
        setSelectedPupilId(loadedPupils[0].studentID);
      } else if (loadedPupils.length === 0) {
        setSelectedPupilId("");
      }
    });
    
    const unsubG = onSnapshot(gQ, (snap) => {
      setClassGradesData(snap.docs.map((d) => d.data()));
      setLoading(false);
    });

    return () => {
      unsubP();
      unsubG();
    };
  }, [academicYear, selectedClass, schoolId]);

  // --- TERM & YEARLY COMPUTATION ENGINE ---
  const gradeSheetData = useMemo(() => {
    if (!selectedPupilId || pupils.length === 0) {
      return { 
        subjects: [], 
        records: {}, 
        totalMarks: 0, 
        overallPercentage: "0.0", 
        overallRank: "—",
        term1Totals: { marks: 0, percentage: "0.0", rank: "—" },
        term2Totals: { marks: 0, percentage: "0.0", rank: "—" },
        term3Totals: { marks: 0, percentage: "0.0", rank: "—" }
      };
    }

    const uniqueSubjects = getSubjectsForClass(selectedClass);
    const records = {};

    const classInfo = classesCache.find(
      (c) => c.schoolId === schoolId && c.className === selectedClass
    );
    const totalSubjectPercentage = classInfo?.subjectPercentage || uniqueSubjects.length * 100;

    // Terms setup matching broadsheet configuration
    const termsMeta = [
      { term: "Term 1", tests: ["Term 1 T1", "Term 1 T2"] },
      { term: "Term 2", tests: ["Term 2 T1", "Term 2 T2"] },
      { term: "Term 3", tests: ["Term 3 T1", "Term 3 T2"] }
    ];

    // Helper to extract ranks per term dynamically based on sorted class dataset
    const computeTermRankings = (termTests) => {
      const termTotals = pupils.map((p) => {
        const pData = classGradesData.filter((x) => x.pupilID === p.studentID);
        const total = uniqueSubjects.reduce((acc, sub) => {
          const g = pData.filter((x) => x.subject?.trim().toLowerCase() === sub.toLowerCase());
          const t1 = Number(g.find((x) => x.test === termTests[0])?.grade || 0);
          const t2 = Number(g.find((x) => x.test === termTests[1])?.grade || 0);
          return acc + (t1 + t2);
        }, 0);
        return { id: p.studentID, total };
      });

      termTotals.sort((a, b) => b.total - a.total);
      termTotals.forEach((s, i) => {
        s.pos = i > 0 && s.total === termTotals[i - 1].total ? termTotals[i - 1].pos : i + 1;
      });

      return termTotals;
    };

    const t1Ranks = computeTermRankings(termsMeta[0].tests);
    const t2Ranks = computeTermRankings(termsMeta[1].tests);
    const t3Ranks = computeTermRankings(termsMeta[2].tests);

    // Compute Overall Yearly Rankings
    const yearlyRankings = pupils.map((p) => {
      const pData = classGradesData.filter((x) => x.pupilID === p.studentID);
      const yearlyTotal = uniqueSubjects.reduce((acc, sub) => {
        const g = pData.filter((x) => x.subject?.trim().toLowerCase() === sub.toLowerCase());
        const t1_1 = Number(g.find((x) => x.test === termsMeta[0].tests[0])?.grade || 0);
        const t1_2 = Number(g.find((x) => x.test === termsMeta[0].tests[1])?.grade || 0);
        const t2_1 = Number(g.find((x) => x.test === termsMeta[1].tests[0])?.grade || 0);
        const t2_2 = Number(g.find((x) => x.test === termsMeta[1].tests[1])?.grade || 0);
        const t3_1 = Number(g.find((x) => x.test === termsMeta[2].tests[0])?.grade || 0);
        const t3_2 = Number(g.find((x) => x.test === termsMeta[2].tests[1])?.grade || 0);
        return acc + t1_1 + t1_2 + t2_1 + t2_2 + t3_1 + t3_2;
      }, 0);
      return { id: p.studentID, total: yearlyTotal };
    });

    yearlyRankings.sort((a, b) => b.total - a.total);
    yearlyRankings.forEach((s, i) => {
      s.pos = i > 0 && s.total === yearlyRankings[i - 1].total ? yearlyRankings[i - 1].pos : i + 1;
    });

    let cumulativeTotalMarks = 0;
    let t1TotalMarks = 0;
    let t2TotalMarks = 0;
    let t3TotalMarks = 0;

    uniqueSubjects.forEach((sub) => {
      const subjectGrades = classGradesData.filter(
        (x) => x.pupilID === selectedPupilId && x.subject?.trim().toLowerCase() === sub.toLowerCase()
      );

      const getTermData = (testsArr, ranksArr) => {
        const t1 = Number(subjectGrades.find((x) => x.test === testsArr[0])?.grade || 0);
        const t2 = Number(subjectGrades.find((x) => x.test === testsArr[1])?.grade || 0);
        const mean = Math.round(t1 + t2);
        const pupilRankObj = ranksArr.find(r => r.id === selectedPupilId);
        return { t1, t2, mean, rnk: pupilRankObj?.pos || "—" };
      };

      const term1 = getTermData(termsMeta[0].tests, t1Ranks);
      const term2 = getTermData(termsMeta[1].tests, t2Ranks);
      const term3 = getTermData(termsMeta[2].tests, t3Ranks);

      t1TotalMarks += term1.mean;
      t2TotalMarks += term2.mean;
      t3TotalMarks += term3.mean;

      // Yearly Cumulative Evaluation 
      const yearlyTotal = term1.mean + term2.mean + term3.mean;
      const yearlyMean = Math.round(yearlyTotal / 3);
      const yearlyRnk = yearlyRankings.find(r => r.id === selectedPupilId)?.pos || "—";

      cumulativeTotalMarks += yearlyTotal;

      records[sub] = { term1, term2, term3, yearly: { mean: yearlyMean, rnk: yearlyRnk } };
    });

    const overallPerc = totalSubjectPercentage > 0 
      ? ((cumulativeTotalMarks / (totalSubjectPercentage * 3)) * 100).toFixed(1) 
      : "0.0";
    const overallPos = yearlyRankings.find(r => r.id === selectedPupilId)?.pos || "—";

    const getTermPerc = (termMarks) => {
      return totalSubjectPercentage > 0 ? ((termMarks / totalSubjectPercentage) * 100).toFixed(1) : "0.0";
    };

    return { 
      subjects: uniqueSubjects, 
      records, 
      totalMarks: cumulativeTotalMarks, 
      overallPercentage: overallPerc, 
      overallRank: overallPos,
      term1Totals: {
        marks: t1TotalMarks,
        percentage: getTermPerc(t1TotalMarks),
        rank: t1Ranks.find(r => r.id === selectedPupilId)?.pos || "—"
      },
      term2Totals: {
        marks: t2TotalMarks,
        percentage: getTermPerc(t2TotalMarks),
        rank: t2Ranks.find(r => r.id === selectedPupilId)?.pos || "—"
      },
      term3Totals: {
        marks: t3TotalMarks,
        percentage: getTermPerc(t3TotalMarks),
        rank: t3Ranks.find(r => r.id === selectedPupilId)?.pos || "—"
      }
    };
  }, [selectedPupilId, pupils, classGradesData, selectedClass, classesCache, schoolId, academicYear]);

  const selectedPupilName = pupils.find(p => p.studentID === selectedPupilId)?.studentName || "";

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 bg-white min-h-screen">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          body {
            background: white !important;
            font-size: 10px !important;
          }
          .no-print {
            display: none !important;
          }
          .print-landscape {
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            background: none !important;
            border: none !important;
          }
          /* Ensure table fits perfectly horizontally */
          table {
            table-layout: auto !important;
            width: 100% !important;
          }
          th, td {
            padding: 4px 2px !important;
            font-size: 9px !important;
          }
        }
      `}</style>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-indigo-900 p-6 rounded-2xl text-white shadow-lg no-print">
        <div>
          <h1 className="text-3xl font-black">{schoolName}</h1>
          <p className="opacity-80 font-medium">Child Progress Report Card / Grade Sheet</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handlePrint}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-6 py-3 rounded-xl shadow transition-all duration-200 border-2 border-emerald-400 cursor-pointer"
          >
            🖨️ Print Landscape
          </button>
          {isFormTeacher && (
            <div className="bg-white/10 px-4 py-2 rounded-lg border border-white/20 text-xs font-bold uppercase tracking-widest">
              🔒 Form Teacher: {assignedClass}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 no-print">
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
          <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block">Academic Year</label>
          <select
            className="w-full bg-transparent font-bold text-gray-700 outline-none"
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
          >
            {academicYears.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
          <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block">Class</label>
          <select
            disabled={isFormTeacher}
            className="w-full bg-transparent font-bold text-gray-700 outline-none disabled:opacity-50"
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
          >
            {availableClasses.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
          <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block">Select Pupil</label>
          <select
            className="w-full bg-transparent font-bold text-gray-700 outline-none"
            value={selectedPupilId}
            onChange={(e) => setSelectedPupilId(e.target.value)}
          >
            {pupils.map((p) => (
              <option key={p.studentID} value={p.studentID}>{p.studentName}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Grade Sheet Presentation */}
     {/* Main Grade Sheet Presentation */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-indigo-600 font-bold animate-pulse">Loading Academic Profile...</p>
        </div>
      ) : !selectedPupilId ? (
        <div className="text-center p-12 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 font-medium">
          No records or pupils found matching current filter specifications.
        </div>
      ) : (
        <div ref={printStyleRef} className="print-landscape bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm">
          {/* Pupil name and class identification block (now visible in print) */}
          <div className="mb-6 pb-4 border-b border-slate-200 flex justify-between items-center">
             <div>
                <span className="text-[10px] font-black text-slate-400 uppercase block tracking-wider">Pupil Name</span>
                <h2 className="text-2xl font-black text-indigo-950 uppercase">{selectedPupilName}</h2>
             </div>
             <div className="bg-indigo-100/50 text-indigo-800 px-4 py-2 rounded-xl font-black text-sm border border-indigo-200">
                {selectedClass}
             </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-center text-[12px] border-collapse bg-white rounded-xl overflow-hidden border border-slate-100">
                <thead>
                    <tr className="bg-indigo-900 text-white font-black text-[11px]">
                        <th className="p-4 text-left border-r border-indigo-950 w-[220px]">SUBJECTS</th>
                        <th colSpan="4" className="p-2 border-r border-indigo-950">TERM 1</th>
                        <th colSpan="4" className="p-2 border-r border-indigo-950">TERM 2</th>
                        <th colSpan="4" className="p-2 border-r border-indigo-950">TERM 3</th>
                        <th colSpan="2" className="p-2 bg-emerald-800 border-r border-emerald-900">YEARLY</th>
                    </tr>
                    <tr className="bg-slate-100 text-slate-600 font-black text-[10px]">
                        <th className="border-r border-b"></th>
                        {/* Term 1 */}
                        <th className="p-2 border-r border-b w-[50px]">T1</th>
                        <th className="p-2 border-r border-b w-[50px]">T2</th>
                        <th className="p-2 border-r border-b w-[50px] bg-indigo-50/50">Mn</th>
                        <th className="p-2 border-r border-b w-[50px] text-red-500">Rnk</th>
                        {/* Term 2 */}
                        <th className="p-2 border-r border-b w-[50px]">T1</th>
                        <th className="p-2 border-r border-b w-[50px]">T2</th>
                        <th className="p-2 border-r border-b w-[50px] bg-indigo-50/50">Mn</th>
                        <th className="p-2 border-r border-b w-[50px] text-red-500">Rnk</th>
                        {/* Term 3 */}
                        <th className="p-2 border-r border-b w-[50px]">T1</th>
                        <th className="p-2 border-r border-b w-[50px]">T2</th>
                        <th className="p-2 border-r border-b w-[50px] bg-indigo-50/50">Mn</th>
                        <th className="p-2 border-r border-b w-[50px] text-red-500">Rnk</th>
                        {/* Yearly */}
                        <th className="p-2 border-r border-b w-[60px] bg-emerald-50 text-emerald-800">Mn</th>
                        <th className="p-2 border-b w-[50px] bg-emerald-50 text-red-500">Rnk</th>
                    </tr>
                </thead>
                <tbody>
                    {gradeSheetData.subjects.map((sub) => {
                        const dat = gradeSheetData.records[sub] || { 
                            term1: {t1:0, t2:0, mean:0, rnk:"—"}, 
                            term2: {t1:0, t2:0, mean:0, rnk:"—"}, 
                            term3: {t1:0, t2:0, mean:0, rnk:"—"}, 
                            yearly: {mean: 0, rnk: "—"} 
                        };
                        return (
                            <tr key={sub} className="hover:bg-slate-50 transition-colors border-b border-slate-100 font-bold text-slate-700">
                                <td className="p-3 text-left border-r bg-slate-50/70 text-slate-800 text-[11px]">{sub}</td>
                                
                                {/* T1 Data */}
                                <td className="p-2 border-r border-slate-100">{dat.term1.t1}</td>
                                <td className="p-2 border-r border-slate-100">{dat.term1.t2}</td>
                                <td className="p-2 border-r border-slate-100 bg-indigo-50/30 text-indigo-700">{dat.term1.mean}</td>
                                <td className="p-2 border-r border-slate-100 font-medium text-red-400 text-[10px]">{dat.term1.rnk}</td>

                                {/* T2 Data */}
                                <td className="p-2 border-r border-slate-100">{dat.term2.t1}</td>
                                <td className="p-2 border-r border-slate-100">{dat.term2.t2}</td>
                                <td className="p-2 border-r border-slate-100 bg-indigo-50/30 text-indigo-700">{dat.term2.mean}</td>
                                <td className="p-2 border-r border-slate-100 font-medium text-red-400 text-[10px]">{dat.term2.rnk}</td>

                                {/* T3 Data */}
                                <td className="p-2 border-r border-slate-100">{dat.term3.t1}</td>
                                <td className="p-2 border-r border-slate-100">{dat.term3.t2}</td>
                                <td className="p-2 border-r border-slate-100 bg-indigo-50/30 text-indigo-700">{dat.term3.mean}</td>
                                <td className="p-2 border-r border-slate-100 font-medium text-red-400 text-[10px]">{dat.term3.rnk}</td>

                                {/* Yearly */}
                                <td className="p-2 border-r border-slate-100 bg-emerald-50/30 text-emerald-800">{dat.yearly.mean}</td>
                                <td className="p-2 border-r border-slate-100 font-medium text-red-400 text-[10px] bg-emerald-50/30">{dat.yearly.rnk}</td>
                            </tr>
                        );
                    })}
                </tbody>
                <tfoot>
                    {/* Per Term Totals / Averages */}
                    <tr className="bg-indigo-50/80 font-extrabold text-indigo-900 border-t-2 border-indigo-500">
                        <td className="text-left px-4 py-2 border-r">Term Totals</td>
                        <td colSpan="2" className="border-r border-indigo-200"></td>
                        <td className="px-4 py-2 border-r border-indigo-200">{gradeSheetData.term1Totals.marks}</td>
                        <td className="border-r border-indigo-200">—</td>
                        <td colSpan="2" className="border-r border-indigo-200"></td>
                        <td className="px-4 py-2 border-r border-indigo-200">{gradeSheetData.term2Totals.marks}</td>
                        <td className="border-r border-indigo-200">—</td>
                        <td colSpan="2" className="border-r border-indigo-200"></td>
                        <td className="px-4 py-2 border-r border-indigo-200">{gradeSheetData.term3Totals.marks}</td>
                        <td className="border-r border-indigo-200">—</td>
                        <td colSpan="2"></td>
                    </tr>
                    <tr className="bg-indigo-50/40 font-bold text-indigo-800">
                        <td className="text-left px-4 py-2 border-r">Term %</td>
                        <td colSpan="3" className="border-r border-indigo-200"></td>
                        <td className="px-4 py-2 border-r border-indigo-200">{gradeSheetData.term1Totals.percentage}%</td>
                        <td colSpan="3" className="border-r border-indigo-200"></td>
                        <td className="px-4 py-2 border-r border-indigo-200">{gradeSheetData.term2Totals.percentage}%</td>
                        <td colSpan="3" className="border-r border-indigo-200"></td>
                        <td className="px-4 py-2 border-r border-indigo-200">{gradeSheetData.term3Totals.percentage}%</td>
                        <td colSpan="2"></td>
                    </tr>
                    <tr className="bg-indigo-100 font-bold border-b border-indigo-400 text-indigo-900">
                        <td className="text-left px-4 py-2 border-r">Term Position</td>
                        <td colSpan="3" className="border-r border-indigo-200"></td>
                        <td className="px-4 py-2 border-r border-indigo-200 text-red-600">{gradeSheetData.term1Totals.rank}</td>
                        <td colSpan="3" className="border-r border-indigo-200"></td>
                        <td className="px-4 py-2 border-r border-indigo-200 text-red-600">{gradeSheetData.term2Totals.rank}</td>
                        <td colSpan="3" className="border-r border-indigo-200"></td>
                        <td className="px-4 py-2 border-r border-indigo-200 text-red-600">{gradeSheetData.term3Totals.rank}</td>
                        <td colSpan="2"></td>
                    </tr>

                    {/* Overall Cumulative Metrics */}
                    <tr className="bg-indigo-100 font-bold text-slate-700 mt-4 border-t-4 border-indigo-950">
                        <td className="text-left px-4 py-3 border-r">Cumulative Total Marks</td>
                        <td colSpan="12"></td>
                        <td className="px-4 py-3 border-r border-indigo-200">{gradeSheetData.totalMarks}</td>
                        <td className="border-r border-indigo-200">—</td>
                    </tr>
                    <tr className="bg-indigo-100/70 font-bold text-slate-700">
                        <td className="text-left px-4 py-3 border-r">Overall Percentage</td>
                        <td colSpan="12"></td>
                        <td className="px-4 py-3 border-r border-indigo-200">{gradeSheetData.overallPercentage}%</td>
                        <td className="border-r border-indigo-200">—</td>
                    </tr>
                    <tr className="bg-indigo-200 font-bold border-b-2 border-indigo-600 text-slate-800">
                        <td className="text-left px-4 py-3 border-r">Overall Position</td>
                        <td colSpan="13"></td>
                        <td className="text-lg border-r border-indigo-300">{gradeSheetData.overallRank}</td>
                    </tr>
                </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default GradeSheet;
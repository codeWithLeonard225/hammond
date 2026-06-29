"use client";

import React, { useState, useEffect, useMemo } from "react";
import { db } from "@/app/lib/firebase";
import { pupilresult } from "@/app/lilresult/resultFetch";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";

// --- FIXED SUBJECT SCHEMAS BY CLASS LEVEL ---
const NURSERY_SUBJECTS = [
    "Mathematics",
    "Word Building",
    "Hand writing",
    "Spelling & Dictation",
    "E. S. P. S",
    "Religious Education",
    "Environmental studies",
    "Physical Health Education",
    "Composition",
    "Rhymes",
    "Literature",
    "Creative Practical Arts",
    "French"
];
const LOWER_PRIMARY_SUBJECTS = [
    "E. S. P. S",
    "Mathematics",
    "Agricultural Science",
    "Physical Health Education",
    "Religious Moral Education",
    "Literature",
    "Home Economics",
    "Reading & Comprehension",
    "Spelling & Dictation",
    "Creative Practical Arts",
    "Composition",
    "Hand writing",
    "Computer Studies",
    "Civic Education",
    "Word Building",
    "Rhymes",
    "Environmental studies",
    "French",
    "Vabal Aptitude",
    "Quantitative Aptitude"
];

const UPPER_PRIMARY_SUBJECTS = [
    "Language Arts",
    "Mathematics",
    "Science",
    "Social Studies",
    "Agricultural Science",
    "Physical Health Education",
    "Religious Moral Education",
    "Literature",
    "Home Economics",
    "Reading & Comprehension",
    "Spelling & Dictation",
    "Creative Practical Arts",
    "Composition",
    "Hand writing",
    "Computer Studies",
    "Civic Education",
    "French",
    "Vabal Aptitude",
    "Quantitative Aptitude"
];

// Helper to determine subject sequence based on standard class groupings
const getSubjectsForClass = (className) => {
    if (!className) return [];
    
    // Normalize string and check structural prefixes to handle variations safely
    const normalized = className.trim();

    const isNursery = [/^Nursery/i].some(regex => regex.test(normalized));
    const isLowerPrimary = [/^Class\s+1/i, /^Class\s+2/i].some(regex => regex.test(normalized));
    const isUpperPrimary = [/^Class\s+3/i, /^Class\s+4/i, /^Class\s+5/i, /^Class\s+6/i].some(regex => regex.test(normalized));

    if (isNursery) return NURSERY_SUBJECTS;
    if (isLowerPrimary) return LOWER_PRIMARY_SUBJECTS;
    if (isUpperPrimary) return UPPER_PRIMARY_SUBJECTS;
    
    return []; // Return empty if class layout format does not match schemas
};

const TermResult = () => {
  const searchParams = useSearchParams();
  const { user } = useAuth();

  // URL context or Auth context fallback
  const schoolId = searchParams.get("schoolId") || user?.schoolId || "N/A";
  const schoolName = searchParams.get("schoolName") || "School Report";

  // --- 1. STATE ---
  const [liveTeacherInfo, setLiveTeacherInfo] = useState(null);
  const [academicYear, setAcademicYear] = useState("");
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [availableClasses, setAvailableClasses] = useState([]);
  const [selectedPupil, setSelectedPupil] = useState("all");
  const [pupils, setPupils] = useState([]);
  const [classGradesData, setClassGradesData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState("Term 1");
  const [classesCache, setClassesCache] = useState([]);

  // Auth Constraints
  const isFormTeacher = liveTeacherInfo?.isFormTeacher ?? user?.data?.isFormTeacher;
  const assignedClass = liveTeacherInfo?.assignClass ?? user?.data?.assignClass;

  const termTests = {
    "Term 1": ["Term 1 T1", "Term 1 T2"],
    "Term 2": ["Term 2 T1", "Term 2 T2"],
    "Term 3": ["Term 3 T1", "Term 3 T2"],
  };
  const tests = termTests[selectedTerm];

  // --- 2. DATA FETCHING ---

  // Fetch Class configurations (for percentage divisors)
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

  // Real-time Teacher Lock Sync
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

  // Fetch Meta (Years/Classes)
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

  // Fetch Students & Grades
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
      setPupils(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => a.studentName.localeCompare(b.studentName))
      );
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

  // --- 3. COMPUTATION (BroadSheet Engine) ---
  const broadSheet = useMemo(() => {
    if (pupils.length === 0)
      return { subjects: [], studentMap: {}, summaries: {} };

    // Use the mapped schema instead of tracking database document entries directly
    const uniqueSubjects = getSubjectsForClass(selectedClass);

    const classInfo = classesCache.find(
      (c) => c.schoolId === schoolId && c.className === selectedClass
    );
    const totalSubjectPercentage = classInfo?.subjectPercentage || uniqueSubjects.length * 100;

    const studentMap = {};
    const summaries = {};
    const subjectRanks = {};

    uniqueSubjects.forEach((subject) => {
      const scores = pupils.map((p) => {
        // Find grades while matching names loosely to minimize minor casing variations
        const g = classGradesData.filter(
          (x) => x.pupilID === p.studentID && x.subject?.trim().toLowerCase() === subject.toLowerCase()
        );
        const t1 = Number(g.find((x) => x.test === tests[0])?.grade || 0);
        const t2 = Number(g.find((x) => x.test === tests[1])?.grade || 0);
        return { id: p.studentID, mean: t1 + t2 };
      });
      scores.sort((a, b) => b.mean - a.mean);
      scores.forEach((s, i) => {
        s.rank = i > 0 && s.mean === scores[i - 1].mean ? scores[i - 1].rank : i + 1;
      });
      subjectRanks[subject] = scores;
    });

    const overallScores = pupils.map((p) => {
      const pData = classGradesData.filter((x) => x.pupilID === p.studentID);
      const total = uniqueSubjects.reduce((acc, sub) => {
        const g = pData.filter((x) => x.subject?.trim().toLowerCase() === sub.toLowerCase());
        const t1 = Number(g.find((x) => x.test === tests[0])?.grade || 0);
        const t2 = Number(g.find((x) => x.test === tests[1])?.grade || 0);
        return acc + (t1 + t2);
      }, 0);
      return { id: p.studentID, total };
    });

    overallScores.sort((a, b) => b.total - a.total);
    overallScores.forEach((s, i) => {
      s.pos = i > 0 && s.total === overallScores[i - 1].total ? overallScores[i - 1].pos : i + 1;
    });

    pupils.forEach((pupil) => {
      const results = {};
      uniqueSubjects.forEach((sub) => {
        const g = classGradesData.filter(
          (x) => x.pupilID === pupil.studentID && x.subject?.trim().toLowerCase() === sub.toLowerCase()
        );
        const t1 = g.find((x) => x.test === tests[0])?.grade || 0;
        const t2 = g.find((x) => x.test === tests[1])?.grade || 0;
        results[sub] = {
          t1,
          t2,
          mean: Math.round(Number(t1) + Number(t2)),
          rank: subjectRanks[sub].find((s) => s.id === pupil.studentID)?.rank || "—",
        };
      });
      studentMap[pupil.studentID] = results;

      const ov = overallScores.find((o) => o.id === pupil.studentID);

      summaries[pupil.studentID] = {
        total: Math.round(ov.total),
        perc: totalSubjectPercentage > 0 ? ((ov.total / totalSubjectPercentage) * 100).toFixed(1) : 0,
        rank: ov.pos,
      };
    });

    return { subjects: uniqueSubjects, studentMap, summaries };
  }, [classGradesData, pupils, tests, classesCache, schoolId, selectedClass]);

  // --- 4. EXPORT ---
  const handlePrint = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });
    const filtered = pupils.filter((p) => selectedPupil === "all" || p.studentID === selectedPupil);
    const step = 8;

    for (let i = 0; i < filtered.length; i += step) {
      if (i > 0) doc.addPage();
      const chunk = filtered.slice(i, i + step);

      doc.setFontSize(20).text(schoolName.toUpperCase(), 595, 40, { align: "center" });
      doc
        .setFontSize(12)
        .text(`${selectedClass} - ${selectedTerm} Broadsheet (${academicYear})`, 595, 60, {
          align: "center",
        });

      const h1 = [
        "SUBJECTS",
        ...chunk.map((p) => ({
          content: p.studentName.toUpperCase(),
          colSpan: 4,
          styles: { halign: "center" },
        })),
      ];
      const h2 = ["", ...chunk.flatMap(() => ["T1", "T2", "AVG", "POS"])];
      const body = broadSheet.subjects.map((sub) => [
        sub,
        ...chunk.flatMap((p) => {
          const r = broadSheet.studentMap[p.studentID]?.[sub] || {};
          return [r.t1, r.t2, r.mean, r.rank];
        }),
      ]);

      autoTable(doc, {
        startY: 80,
        head: [h1, h2],
        body: [
          ...body,
          [
            { content: "TOTAL", styles: { fontStyle: "bold" } },
            ...chunk.flatMap((p) => [
              {
                content: broadSheet.summaries[p.studentID].total,
                colSpan: 4,
                styles: { halign: "center", fontStyle: "bold" },
              },
            ]),
          ],
          [
            { content: "POSITION", styles: { fontStyle: "bold" } },
            ...chunk.flatMap((p) => [
              {
                content: broadSheet.summaries[p.studentID].rank,
                colSpan: 4,
                styles: { halign: "center", fontStyle: "bold", textColor: [200, 0, 0] },
              },
            ]),
          ],
        ],
        theme: "grid",
        styles: { fontSize: 8 },
        headStyles: { fillColor: [40, 53, 147] },
      });
    }
    doc.save(`${selectedClass}_Broadsheet_${selectedTerm}.pdf`);
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 bg-white min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-indigo-900 p-6 rounded-2xl text-white shadow-lg">
        <div>
          <h1 className="text-3xl font-black">{schoolName}</h1>
          <p className="opacity-80 font-medium">Academic Performance Broad Sheet</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {isFormTeacher && (
            <div className="bg-white/10 px-4 py-2 rounded-lg border border-white/20 text-xs font-bold uppercase tracking-widest">
              🔒 Form Teacher: {assignedClass}
            </div>
          )}
          <button
            onClick={handlePrint}
            className="bg-yellow-400 hover:bg-yellow-500 text-indigo-950 px-6 py-2 rounded-lg font-black transition-all shadow-md"
          >
            DOWNLOAD PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Academic Term", val: selectedTerm, set: setSelectedTerm, opt: Object.keys(termTests) },
          { label: "Academic Year", val: academicYear, set: setAcademicYear, opt: academicYears },
          { label: "Class", val: selectedClass, set: setSelectedClass, opt: availableClasses, dis: isFormTeacher },
        ].map((f, i) => (
          <div key={i} className="bg-gray-50 p-4 rounded-xl border border-gray-200">
            <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block">{f.label}</label>
            <select
              disabled={f.dis}
              className="w-full bg-transparent font-bold text-gray-700 outline-none disabled:opacity-50"
              value={f.val}
              onChange={(e) => f.set(e.target.value)}
            >
              {f.opt.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
          <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block">Student View</label>
          <select
            className="w-full bg-transparent font-bold text-gray-700 outline-none"
            value={selectedPupil}
            onChange={(e) => setSelectedPupil(e.target.value)}
          >
            <option value="all">All Records</option>
            {pupils.map((p) => (
              <option key={p.studentID} value={p.studentID}>
                {p.studentName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-indigo-600 font-bold animate-pulse">Calculating Broad Sheet...</p>
        </div>
      ) : broadSheet.subjects.length === 0 ? (
        <div className="text-center p-12 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 font-medium">
          Please select a standard Nursery, Lower Primary, or Upper Primary class setup to preview the core broadsheet structure.
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-2xl shadow-sm">
          <table className="w-full text-center text-[11px] border-collapse">
            <thead className="bg-gray-100 text-gray-600 uppercase font-black">
              <tr>
                <th className="p-4 border-r sticky left-0 bg-gray-100 z-30 text-left min-w-[180px]">Subject List</th>
                {pupils
                  .filter((p) => selectedPupil === "all" || p.studentID === selectedPupil)
                  .map((p) => (
                    <th key={p.studentID} colSpan="4" className="p-2 border-r border-b bg-indigo-50 text-indigo-800 truncate max-w-[150px]">
                      {p.studentName}
                    </th>
                  ))}
              </tr>
              <tr className="bg-white">
                <th className="border-r border-b sticky left-0 bg-white z-30"></th>
                {pupils
                  .filter((p) => selectedPupil === "all" || p.studentID === selectedPupil)
                  .map((p) => (
                    <React.Fragment key={`h-${p.studentID}`}>
                      <th className="p-1 border-r border-b text-[9px]">T1</th>
                      <th className="p-1 border-r border-b text-[9px]">T2</th>
                      <th className="p-1 border-r border-b text-[9px] bg-indigo-100">AV</th>
                      <th className="p-1 border-r border-b text-[9px] text-red-500">PO</th>
                    </React.Fragment>
                  ))}
              </tr>
            </thead>
            <tbody>
              {broadSheet.subjects.map((sub) => (
                <tr key={sub} className="hover:bg-gray-50 transition-colors border-b">
                  <td className="p-3 text-left font-bold border-r sticky left-0 bg-white z-10 text-gray-700">{sub}</td>
                  {pupils
                    .filter((p) => selectedPupil === "all" || p.studentID === selectedPupil)
                    .map((p) => {
                      const r = broadSheet.studentMap[p.studentID]?.[sub] || {};
                      return (
                        <React.Fragment key={`${p.studentID}-${sub}`}>
                          <td className="p-2 border-r">{r.t1 || 0}</td>
                          <td className="p-2 border-r">{r.t2 || 0}</td>
                          <td className="p-2 border-r font-bold bg-indigo-50/30 text-indigo-700">{r.mean || 0}</td>
                          <td className="p-2 border-r font-medium text-red-400">{r.rank || "—"}</td>
                        </React.Fragment>
                      );
                    })}
                </tr>
              ))}
              <tr className="bg-indigo-900 text-white font-black">
                <td className="p-4 sticky left-0 bg-indigo-900 z-10 text-left">TOTAL SCORE</td>
                {pupils
                  .filter((p) => selectedPupil === "all" || p.studentID === selectedPupil)
                  .map((p) => (
                    <td key={`tot-${p.studentID}`} colSpan="4" className="border-r text-sm">
                      {broadSheet.summaries[p.studentID]?.total || 0}
                    </td>
                  ))}
              </tr>
              <tr className="bg-gray-100 text-gray-800 font-black border-b">
                <td className="p-4 sticky left-0 bg-gray-100 z-10 text-left">PERCENTAGE (%)</td>
                {pupils
                  .filter((p) => selectedPupil === "all" || p.studentID === selectedPupil)
                  .map((p) => {
                    const perc = broadSheet.summaries[p.studentID]?.perc || 0;
                    return (
                      <td
                        key={`perc-${p.studentID}`}
                        colSpan="4"
                        className={`border-r text-sm ${perc >= 50 ? "text-green-600" : "text-red-600"}`}
                      >
                        {perc}%
                      </td>
                    );
                  })}
              </tr>
              <tr className="bg-red-50 text-red-600 font-black">
                <td className="p-4 sticky left-0 bg-red-50 z-10 text-left">CLASS POSITION</td>
                {pupils
                  .filter((p) => selectedPupil === "all" || p.studentID === selectedPupil)
                  .map((p) => (
                    <td key={`pos-${p.studentID}`} colSpan="4" className="border-r text-lg">
                      {broadSheet.summaries[p.studentID]?.rank || "—"}
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

export default TermResult;
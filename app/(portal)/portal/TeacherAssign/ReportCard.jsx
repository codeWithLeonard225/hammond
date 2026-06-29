'use client';
import React, { useState, useEffect, useMemo } from "react";
import { db } from "@/app/lib/firebase"; 
import { pupilresult as schooldb } from "@/app/lilresult/resultFetch";
import { pupilLoginFetch } from "@/app/lilpupil/PupilLogin";
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
    
    const normalized = className.trim();

    const isNursery = [/^nursery\s+1/i, /^nursery\s+2/i, /^nursery\s+3/i].some(regex => regex.test(normalized));
    const isLowerPrimary = [/^Class\s+1/i, /^Class\s+2/i].some(regex => regex.test(normalized));
    const isUpperPrimary = [/^Class\s+3/i, /^Class\s+4/i, /^Class\s+5/i, /^Class\s+6/i].some(regex => regex.test(normalized));

    if (isNursery) return NURSERY_SUBJECTS;
    if (isLowerPrimary) return LOWER_PRIMARY_SUBJECTS;
    if (isUpperPrimary) return UPPER_PRIMARY_SUBJECTS;
    
    return [];
};

const ReportCard = () => {
  const { user } = useAuth();
  const [liveTeacherInfo, setLiveTeacherInfo] = useState(null);
  const [academicYear, setAcademicYear] = useState("");
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [availableClasses, setAvailableClasses] = useState([]);
  const [selectedPupil, setSelectedPupil] = useState("");
  const [pupils, setPupils] = useState([]);
  const [classGradesData, setClassGradesData] = useState([]);
  const [pupilGradesData, setPupilGradesData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState("Term 1");
  const [totalPupilsInClass, setTotalPupilsInClass] = useState(0);
  
  const [classesCache, setClassesCache] = useState([]);
  
  const searchParams = useSearchParams();

  const schoolId = searchParams.get("schoolId") || user?.schoolId;
  const schoolName = searchParams.get("schoolName") || "School Report";
  const schoolLogoUrl = searchParams.get("schoolLogoUrl");
  const schoolAddress = searchParams.get("schoolAddress");
  const schoolMotto = searchParams.get("schoolMotto");
  const schoolContact = searchParams.get("schoolContact");
  const email = searchParams.get("email");

  const isFormTeacher = liveTeacherInfo?.isFormTeacher ?? user?.data?.isFormTeacher;
  const assignedClass = liveTeacherInfo?.assignClass ?? user?.data?.assignClass;

  const termTests = {
    "Term 1": ["Term 1 T1", "Term 1 T2"],
    "Term 2": ["Term 2 T1", "Term 2 T2"],
    "Term 3": ["Term 3 T1", "Term 3 T2"],
  };

  const tests = termTests[selectedTerm];

  // Check if current selection is Nursery
  const isNurseryClass = useMemo(() => {
    return /^nursery/i.test(selectedClass);
  }, [selectedClass]);

  // Dynamic grade color based on the maximum marks for each column
  const getGradeColor = (value, maxMarks) => {
    const grade = Number(value);

    if (value === "" || value === null || value === undefined || isNaN(grade)) {
      return "text-gray-400";
    }

    // Scale thresholds automatically if nursery profile is triggered
    const ceiling = isNurseryClass ? 10 : maxMarks;
    const passMark = ceiling * 0.5;

    return grade >= passMark
      ? "text-blue-600 font-bold"
      : "text-red-600 font-bold";
  };

  // 1. Live Teacher Info Listener
  useEffect(() => {
    if (!user?.data?.teacherID || !schoolId) return;
    const q = query(collection(db, "Teachers"), where("teacherID", "==", user.data.teacherID), where("schoolId", "==", schoolId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) setLiveTeacherInfo({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
    });
    return () => unsubscribe();
  }, [user, schoolId]);

  // 1.5 Fetch Classes Cache (Necessary for overallPercentage)
  useEffect(() => {
    if (!schoolId) return;
    const fetchClasses = async () => {
      const snapshot = await getDocs(query(collection(db, "Classes"), where("schoolId", "==", schoolId)));
      const data = snapshot.docs.map(doc => doc.data());
      setClassesCache(data);
    };
    fetchClasses();
  }, [schoolId]);

  // 2. Metadata Listener (Years and Classes)
  useEffect(() => {
    if (!schoolId) return;
    const q = query(collection(schooldb, "PupilGrades"), where("schoolId", "==", schoolId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
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
    return () => unsubscribe();
  }, [schoolId, isFormTeacher, assignedClass]);

  // 3. Fetch Pupils
  useEffect(() => {
    if (!academicYear || !selectedClass || !schoolId) return;
    const q = query(collection(pupilLoginFetch, "PupilsReg"), where("schoolId", "==", schoolId), where("academicYear", "==", academicYear), where("class", "==", selectedClass));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.studentName.localeCompare(b.studentName));
      setPupils(data);
      setTotalPupilsInClass(data.length);
      if (data.length > 0) setSelectedPupil(data[0].studentID);
    });
    return () => unsubscribe();
  }, [academicYear, selectedClass, schoolId]);

  // 4 & 5. Fetch Grades Data
  useEffect(() => {
    if (!academicYear || !selectedClass || !schoolId) return;
    const q = query(collection(schooldb, "PupilGrades"), where("academicYear", "==", academicYear), where("schoolId", "==", schoolId), where("className", "==", selectedClass));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setClassGradesData(snapshot.docs.map((doc) => doc.data()));
    });
    return () => unsubscribe();
  }, [academicYear, selectedClass, schoolId]);

  useEffect(() => {
    if (!academicYear || !selectedClass || !selectedPupil || !schoolId) return;
    setLoading(true);
    const q = query(collection(schooldb, "PupilGrades"), where("academicYear", "==", academicYear), where("schoolId", "==", schoolId), where("className", "==", selectedClass), where("pupilID", "==", selectedPupil));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPupilGradesData(snapshot.docs.map((doc) => doc.data()));
      setLoading(false);
    });
    return () => unsubscribe();
  }, [academicYear, selectedClass, selectedPupil, schoolId]);

  // 6. CALCULATE REPORT
  const { reportRows, totalMarks, overallPercentage, overallRank } = useMemo(() => {
    const uniqueSubjects = getSubjectsForClass(selectedClass);

    if (uniqueSubjects.length === 0 || pupils.length === 0)
      return { reportRows: [], totalMarks: 0, overallPercentage: 0, overallRank: "—" };

    const pupilIDs = pupils.map((p) => p.studentID);

    const classInfo = classesCache.find(c => c.schoolId === schoolId && c.className === selectedClass);
    // Scale total baseline calculations if a nursery category is loaded
    const defaultTotal = isNurseryClass ? uniqueSubjects.length * 20 : uniqueSubjects.length * 100;
    const totalSubjectPercentage = classInfo?.subjectPercentage || defaultTotal;

    const classMeansBySubject = {};
    for (const subject of uniqueSubjects) {
      const subjectScores = pupilIDs.map((id) => {
        const g = classGradesData.filter(x => x.pupilID === id && x.subject?.trim().toLowerCase() === subject.toLowerCase());
        const t1 = g.find(x => x.test === tests[0])?.grade || 0;
        const t2 = g.find(x => x.test === tests[1])?.grade || 0;
        return { id, mean: Number(t1) + Number(t2) };
      });
      subjectScores.sort((a, b) => b.mean - a.mean);
      subjectScores.forEach((x, i) => {
        if (i > 0 && x.mean === subjectScores[i - 1].mean) x.rank = subjectScores[i - 1].rank;
        else x.rank = i + 1;
      });
      classMeansBySubject[subject] = subjectScores;
    }

    let totalSum = 0;
    const subjectData = uniqueSubjects.map(subject => {
      const t1 = pupilGradesData.find(g => g.subject?.trim().toLowerCase() === subject.toLowerCase() && g.test === tests[0])?.grade || 0;
      const t2 = pupilGradesData.find(g => g.subject?.trim().toLowerCase() === subject.toLowerCase() && g.test === tests[1])?.grade || 0;
      
      const rawMean = Number(t1) + Number(t2);
      totalSum += rawMean;
      const mean = Math.round(rawMean);
      const rank = classMeansBySubject[subject]?.find(s => s.id === selectedPupil)?.rank || "—";
      return { subject, test1: t1, test2: t2, mean, rank };
    });

    const overallScores = pupilIDs.map(id => {
      const pupilData = classGradesData.filter(x => x.pupilID === id);
      const totalMean = uniqueSubjects.reduce((acc, subject) => {
        const t1 = pupilData.find(x => x.subject?.trim().toLowerCase() === subject.toLowerCase() && x.test === tests[0])?.grade || 0;
        const t2 = pupilData.find(x => x.subject?.trim().toLowerCase() === subject.toLowerCase() && x.test === tests[1])?.grade || 0;
        return acc + (Number(t1) + Number(t2));
      }, 0);
      return { id, totalMean };
    });

    overallScores.sort((a, b) => b.totalMean - a.totalMean);
    overallScores.forEach((x, i) => {
      if (i > 0 && x.totalMean === overallScores[i - 1].totalMean) x.rank = overallScores[i - 1].rank;
      else x.rank = i + 1;
    });

    const overallRank = overallScores.find(x => x.id === selectedPupil)?.rank || "—";
    const totalMarks = Math.round(totalSum);
    const overallPercentage = totalSubjectPercentage > 0 ? ((totalSum / totalSubjectPercentage) * 100).toFixed(1) : 0;

    return { reportRows: subjectData, totalMarks, overallPercentage, overallRank };
  }, [pupilGradesData, classGradesData, pupils, selectedPupil, selectedTerm, selectedClass, classesCache, tests, schoolId, isNurseryClass]);

  const pupilInfo = useMemo(() => pupils.find((p) => p.studentID === selectedPupil) || null, [pupils, selectedPupil]);

  // 🧾 Handle PDF Printing Logic
  const handlePrintPDF = () => {
    if (!pupilInfo) return;

    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "A4" });
    const pupilPhotoUrl = pupilInfo.userPhotoUrl || "https://via.placeholder.com/96";

    const loadImage = (url) =>
      new Promise((resolve) => {
        const img = new Image();
        img.src = url;
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
      });

    Promise.all([loadImage(schoolLogoUrl), loadImage(pupilPhotoUrl)]).then(([logo, pupilPhoto]) => {
      let y = 30;

      doc.setFontSize(18).setFont(doc.getFont().fontName, "bold");
      doc.text(schoolName || "Unknown School", doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
      y += 5;

      doc.setDrawColor(63, 81, 181);
      doc.line(40, y, doc.internal.pageSize.getWidth() - 40, y);
      y += 15;

      if (logo) doc.addImage(logo, "PNG", 40, y, 50, 50);

      doc.setFontSize(10).setFont(doc.getFont().fontName, "normal");
      doc.text(schoolAddress || "Address not found", doc.internal.pageSize.getWidth() / 2, y + 5, { align: "center" });
      doc.text(schoolMotto || "No motto", doc.internal.pageSize.getWidth() / 2, y + 20, { align: "center" });
      doc.text(schoolContact || "No contact info", doc.internal.pageSize.getWidth() / 2, y + 35, { align: "center" });
      if (email) doc.text(email, doc.internal.pageSize.getWidth() / 2, y + 50, { align: "center" });

      const rightX = doc.internal.pageSize.getWidth() - 90;
      if (pupilPhoto) doc.addImage(pupilPhoto, "JPEG", rightX, y, 50, 50);
      else if (logo) doc.addImage(logo, "PNG", rightX, y, 50, 50);

      y += 75;
      y += 10; 

      doc.setFontSize(12).setFont(doc.getFont().fontName, "bold");
      doc.text(`Pupil ID: ${pupilInfo.studentID}`, 40, y);
      
      const classText = `Class: ${pupilInfo.class || "N/A"} (${totalPupilsInClass} pupils)`;
      doc.text(classText, doc.internal.pageSize.getWidth() / 2 + 10, y);
      y += 20;

      doc.text(`Pupil Name: ${pupilInfo.studentName}`, 40, y);
      doc.text(`Academic Year: ${academicYear}`, doc.internal.pageSize.getWidth() / 2 + 10, y);
      y += 25;
      
      doc.setFontSize(16).setFont(doc.getFont().fontName, "bold");
      doc.text(selectedTerm, doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
      y += 20;

      const tableData = reportRows.map((r) => [r.subject, r.test1, r.test2, r.mean, r.rank]);
      const pdfHeaders = ["Subject", tests[0].split(' ')[2] || 'T1', tests[1].split(' ')[2] || 'T2', "Mean", "Rank"];

      autoTable(doc, {
        startY: y,
        head: [pdfHeaders],
        body: tableData,
        theme: "striped",
        styles: { halign: "center", fontSize: 10 },
        headStyles: { fillColor: [63, 81, 181], textColor: 255 },
        margin: { left: 40, right: 40 },
        columnStyles: { 0: { halign: "left", cellWidth: 150 } },
        didParseCell: (data) => {
          const gradeColumns = [1, 2, 3];
          const rankColumn = 4;

          if (gradeColumns.includes(data.column.index)) {
            const grade = Number(data.cell.raw) || 0;
            
            // Adjust threshold ceilings conditionally for Nursery setups
            let maxMarks = 100;
            if (data.column.index === 1) maxMarks = isNurseryClass ? 10 : 30;
            if (data.column.index === 2) maxMarks = isNurseryClass ? 10 : 70;
            if (data.column.index === 3) maxMarks = isNurseryClass ? 20 : 100;

            const passMark = maxMarks * 0.5;

            if (grade >= passMark) data.cell.styles.textColor = [0, 0, 255]; // Blue
            else data.cell.styles.textColor = [255, 0, 0]; // Red
            data.cell.styles.fontStyle = "bold";
          }

          if (data.column.index === rankColumn) {
            data.cell.styles.textColor = [255, 0, 0];
            data.cell.styles.fontStyle = "bold";
          }
        },
      });

      const finalY = doc.lastAutoTable.finalY + 20;
      doc.setFontSize(12).setFont(doc.getFont().fontName, "bold");
      doc.text(`Total Marks: ${totalMarks}`, 40, finalY);
      doc.text(`Percentage: ${overallPercentage}%`, 40, finalY + 15);
      doc.text(`Overall Position: ${overallRank} / ${totalPupilsInClass}`, 40, finalY + 30);

      doc.setFontSize(10).setFont(doc.getFont().fontName, "normal");
      doc.text("________________________", 400, finalY + 20);
      doc.text("Principal's Signature", 400, finalY + 35);

      doc.save(`${pupilInfo.studentName}_${selectedTerm}_Report.pdf`);
    });
  };

  return (
    <div className="max-w-5xl mx-auto p-6 bg-white shadow-xl rounded-2xl">
      <h2 className="text-2xl font-bold text-center text-indigo-700 mb-6">{schoolName}</h2>

      <div className="flex justify-center gap-4 mb-6">
        {Object.keys(termTests).map((term) => (
          <button key={term} onClick={() => setSelectedTerm(term)} className={`px-4 py-2 rounded-lg border ${selectedTerm === term ? "bg-indigo-600 text-white" : "bg-gray-100 hover:bg-indigo-100"}`}>{term}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 p-4 border rounded-lg bg-indigo-50">
        <div>
          <label className="font-semibold text-sm">Academic Year:</label>
          <select className="w-full border rounded-lg px-3 py-2" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>
            {academicYears.map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="font-semibold text-sm">Class:</label>
          <select className="w-full border rounded-lg px-3 py-2" value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
            {availableClasses.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="font-semibold text-sm">Pupil:</label>
          <select className="w-full border rounded-lg px-3 py-2" value={selectedPupil} onChange={(e) => setSelectedPupil(e.target.value)}>
            {pupils.map(p => <option key={p.studentID} value={p.studentID}>{p.studentName}</option>)}
          </select>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={handlePrintPDF} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg shadow disabled:bg-gray-400" disabled={loading || reportRows.length === 0}>
          Generate PDF Report
        </button>
      </div>

      {pupilInfo && (
        <div className="flex items-center gap-4 mb-6 border p-4 rounded-lg bg-gray-50 shadow-sm">
          <img
            src={pupilInfo.userPhotoUrl || "https://via.placeholder.com/96"}
            alt="Pupil"
            className="w-24 h-24 object-cover rounded-full border-2 border-indigo-500"
          />
          <div className="space-y-1">
            <p className="text-xl font-bold text-indigo-800">{pupilInfo.studentName}</p>
            <p className="text-gray-600 text-sm"><span className="font-bold">Class:</span> {selectedClass} <span className="ml-2 text-indigo-500 italic">({totalPupilsInClass} Students)</span></p>
            <p className="text-gray-600 text-sm"><span className="font-bold">Student ID:</span> {pupilInfo.studentID}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center p-8">Loading...</div>
      ) : reportRows.length > 0 ? (
        <div className="overflow-x-auto border rounded-lg shadow-md">
          <table className="min-w-full text-sm text-center border-collapse">
            <thead className="bg-indigo-600 text-white">
              <tr>
                <th className="px-4 py-2 text-left">Subject</th>
                {tests.map((t) => <th key={t} className="px-4 py-2">{t.split(' ').pop()}</th>)}
                <th className="px-4 py-2">Mn</th>
                <th className="px-4 py-2">Rnk</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map((row, idx) => (
                <tr key={idx} className="border-b hover:bg-gray-50">
                  <td className="text-left px-4 py-2 font-semibold">{row.subject}</td>
                  {/* Test 1 Grade */}
                  <td className={`px-4 py-2 ${getGradeColor(row.test1, isNurseryClass ? 10 : 30)}`}>
                    {row.test1 || 0}
                  </td>
                  {/* Test 2 Grade */}
                  <td className={`px-4 py-2 ${getGradeColor(row.test2, isNurseryClass ? 10 : 70)}`}>
                    {row.test2 || 0}
                  </td>
                  {/* Mean Grade */}
                  <td className={`px-4 py-2 font-bold ${getGradeColor(row.mean, isNurseryClass ? 20 : 100)}`}>
                    {row.mean || 0}
                  </td>
                  <td className="px-4 py-2 font-bold text-red-600">{row.rank || "—"}</td>
                </tr>
              ))}
              <tr className="bg-indigo-100 font-bold">
                <td className="text-left px-4 py-2">Total Marks</td>
                <td colSpan="2"></td>
                <td className="px-4 py-2">{totalMarks}</td>
                <td>—</td>
              </tr>
              <tr className="bg-indigo-100/70 font-bold">
                <td className="text-left px-4 py-2">Percentage</td>
                <td colSpan="2"></td>
                <td className="px-4 py-2">{overallPercentage}%</td>
                <td>—</td>
              </tr>
              <tr className="bg-indigo-200 font-bold border-b-2 border-indigo-600">
                <td className="text-left px-4 py-2">Position</td>
                <td colSpan="3"></td>
                <td className="text-lg">{overallRank}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center p-12 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 font-medium">
          Please select a standard Nursery or Primary Class setup to preview the student report profile structure.
        </div>
      )}
    </div>
  );
};

export default ReportCard;
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { pupilresult } from "@/app/lilresult/resultFetch";
import { pupilLoginFetch } from "@/app/lilpupil/PupilLogin";
import { db } from "@/app/lib/firebase";
import { useAuth } from "@/app/context/AuthContext";
import {
    collection,
    onSnapshot,
    query,
    where,
    getDocs,
} from "firebase/firestore";
import { useSearchParams } from "next/navigation";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import localforage from "localforage";

const matrixStore = localforage.createInstance({
    name: "SubMatrixCache",
    storeName: "classGrades",
});

const SubGradeMatrixPage = () => {
    const searchParams = useSearchParams();
    const { user } = useAuth();
    const schoolId = searchParams.get("schoolId") || user?.schoolId || "N/A";

    // 1. STATE MANAGEMENT
    const [liveTeacherInfo, setLiveTeacherInfo] = useState(null);
    const [academicYear, setAcademicYear] = useState("");
    const [academicYears, setAcademicYears] = useState([]);
    const [selectedClass, setSelectedClass] = useState("");
    const [availableClasses, setAvailableClasses] = useState([]);
    const [pupils, setPupils] = useState([]); 
    const [classGradesData, setClassGradesData] = useState([]); 
    const [selectedTerm, setSelectedTerm] = useState("Term 1");
    const [selectedSubject, setSelectedSubject] = useState("");
    const [subjectOptions, setSubjectOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Derived values for Form Teacher Lock
    const isFormTeacher = liveTeacherInfo?.isFormTeacher ?? user?.data?.isFormTeacher;
    const assignedClass = liveTeacherInfo?.assignClass ?? user?.data?.assignClass;

    const termTests = {
        "Term 1": ["Term 1 T1", "Term 1 T2"],
        "Term 2": ["Term 2 T1", "Term 2 T2"],
        "Term 3": ["Term 3 T1", "Term 3 T2"],
    };

    const tests = termTests[selectedTerm];
    const test1Name = tests[0];
    const test2Name = tests[1];

    // --- 2. DATA FETCHING ---

    // 2A. Real-time Teacher Info Fetch (To detect lock changes)
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

    // 2B. Fetch Metadata (Years, Classes, Subjects)
    useEffect(() => {
        if (!schoolId || schoolId === "N/A") return;

        const q = query(
            collection(pupilresult, "PupilGrades"),
            where("schoolId", "==", schoolId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map((doc) => doc.data());

            const years = [...new Set(data.map((d) => d.academicYear))].sort().reverse();
            const classes = [...new Set(data.map((d) => d.className))].sort();
            const subjects = [...new Set(data.map((d) => d.subject))].sort();

            setAcademicYears(years);
            setSubjectOptions(subjects);
            
            if (years.length > 0 && !academicYear) setAcademicYear(years[0]);
            if (subjects.length > 0 && !selectedSubject) setSelectedSubject(subjects[0]);

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

    // 2C. Fetch Class Grades with Cache
    const fetchClassGrades = useCallback(async (year, className, sId) => {
        if (!year || !className || sId === "N/A") return;
        setLoading(true);
        const cacheKey = `${sId}_${year}_${className}_GRADES`;
        
        try {
            const cachedData = await matrixStore.getItem(cacheKey);
            const CACHE_LIFETIME = 10 * 1000; 

            if (cachedData && (new Date().getTime() - cachedData.timestamp < CACHE_LIFETIME)) {
                setClassGradesData(cachedData.grades);
                setLoading(false);
                return; 
            }

            const gradesQuery = query(
                collection(pupilresult, "PupilGrades"),
                where("academicYear", "==", year),
                where("schoolId", "==", sId),
                where("className", "==", className)
            );
            
            const gradesSnapshot = await getDocs(gradesQuery);
            const gradesData = gradesSnapshot.docs.map((doc) => doc.data());

            setClassGradesData(gradesData);
            await matrixStore.setItem(cacheKey, { grades: gradesData, timestamp: new Date().getTime() });
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    // 2D. Fetch Pupils & Grades Trigger
    useEffect(() => {
        if (!academicYear || !selectedClass || schoolId === "N/A") return;
        
        const pupilsQuery = query(
            collection(pupilLoginFetch, "PupilsReg"),
            where("schoolId", "==", schoolId),
            where("academicYear", "==", academicYear),
            where("class", "==", selectedClass)
        );

        const pupilsUnsub = onSnapshot(pupilsQuery, (snapshot) => {
            const data = snapshot.docs
                .map((doc) => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => (a.studentName || "").localeCompare(b.studentName || ""));
            setPupils(data);
        });

        fetchClassGrades(academicYear, selectedClass, schoolId);
        return () => pupilsUnsub();
    }, [academicYear, selectedClass, schoolId, fetchClassGrades]);

    // 3. MATRIX LOGIC
  // --- 3. MATRIX LOGIC ---
const { pupilMatrix } = useMemo(() => {
    if (classGradesData.length === 0 || pupils.length === 0 || !selectedSubject) return { pupilMatrix: [] };

    const matrix = pupils.map((pupil) => {
        const pGrades = classGradesData.filter(g => g.pupilID === pupil.studentID && g.subject === selectedSubject && tests.includes(g.test));
        const t1 = pGrades.find(g => g.test === test1Name)?.grade || "—";
        const t2 = pGrades.find(g => g.test === test2Name)?.grade || "—";

        let total = 0, count = 0;
        if (t1 !== "—") { total += Number(t1); count++; }
        if (t2 !== "—") { total += Number(t2); count++; }

        // 🔥 UPDATED: Straight summation of continuous test grades directly instead of an average division
        const mean = count > 0 ? Math.round(total) : "—";
        return {
            studentID: pupil.studentID,
            studentName: pupil.studentName,
            test1: t1,
            test2: t2,
            mean: mean,
            rawMean: mean === "—" ? -1 : mean,
            rank: "—"
        };
    });

    // Ranking Logic
    const ranked = [...matrix].filter(p => p.rawMean !== -1).sort((a, b) => b.rawMean - a.rawMean);
    ranked.forEach((p, i) => {
        if (i > 0 && p.rawMean === ranked[i - 1].rawMean) p.rank = ranked[i - 1].rank;
        else p.rank = i + 1;
    });

    return { 
        pupilMatrix: matrix.map(p => {
            const r = ranked.find(rk => rk.studentID === p.studentID);
            return r ? { ...p, rank: r.rank } : p;
        })
    };
}, [classGradesData, pupils, selectedSubject, selectedTerm, test1Name, test2Name]);

    // 4. PDF GENERATOR
    const handlePrintPDF = () => {
        const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "A4" });
        doc.setFontSize(16).text(`Grade Matrix: ${selectedClass}`, 40, 40);
        doc.setFontSize(12).text(`Subject: ${selectedSubject} (${selectedTerm})`, 40, 60);
        
        autoTable(doc, {
            startY: 80,
            head: [["Pupil Name", test1Name.split(' ').pop(), test2Name.split(' ').pop(), "Mean", "Rank"]],
            body: pupilMatrix.map(p => [p.studentName, p.test1, p.test2, p.mean, p.rank]),
            headStyles: { fillColor: [79, 70, 229] }
        });
        doc.save(`${selectedClass}_Matrix.pdf`);
    };

    return (
        <div className="max-w-7xl mx-auto p-6 bg-white shadow-xl rounded-2xl border border-gray-100">
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 border-b pb-6">
                <div>
                    <h2 className="text-3xl font-extrabold text-indigo-900">Grade Matrix Report</h2>
                    <p className="text-gray-500 text-sm">Reviewing subject performance for <span className="font-bold text-indigo-600">{selectedClass}</span></p>
                </div>
                {isFormTeacher && (
                    <span className="bg-green-100 text-green-700 px-4 py-1.5 rounded-full text-xs font-bold border border-green-200">
                        🔒 LOCKED TO: {assignedClass}
                    </span>
                )}
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 p-6 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                <div>
                    <label className="block text-xs font-bold text-indigo-700 mb-2 uppercase">Academic Year</label>
                    <select className="w-full p-2.5 rounded-xl border-gray-200" value={academicYear} onChange={e => setAcademicYear(e.target.value)}>
                        {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-indigo-700 mb-2 uppercase">Class</label>
                    <select 
                        className="w-full p-2.5 rounded-xl border-gray-200 disabled:bg-gray-100" 
                        value={selectedClass} 
                        disabled={isFormTeacher} 
                        onChange={e => setSelectedClass(e.target.value)}
                    >
                        {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-indigo-700 mb-2 uppercase">Term</label>
                    <select className="w-full p-2.5 rounded-xl border-gray-200" value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
                        {Object.keys(termTests).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-indigo-700 mb-2 uppercase">Subject</label>
                    <select className="w-full p-2.5 rounded-xl border-gray-200" value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
                        {subjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
            </div>

            <div className="flex justify-end mb-6">
                <button onClick={handlePrintPDF} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-xl shadow-lg transition flex items-center font-bold text-sm">
                    DOWNLOAD PDF MATRIX
                </button>
            </div>

            {loading ? (
                <div className="text-center p-20 animate-pulse text-indigo-600 font-bold">Generating Matrix...</div>
            ) : pupilMatrix.length > 0 ? (
                <div className="overflow-x-auto rounded-2xl border border-gray-200">
                    <table className="min-w-full text-sm text-center border-collapse">
                        <thead className="bg-indigo-600 text-white">
                            <tr>
                                <th className="px-6 py-4 text-left w-64">Pupil Name</th>
                                <th className="px-4 py-4">{test1Name.split(' ').pop()}</th>
                                <th className="px-4 py-4">{test2Name.split(' ').pop()}</th>
                                <th className="px-4 py-4">Mean</th>
                                <th className="px-4 py-4">Rank</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {pupilMatrix.map((p) => (
                                <tr key={p.studentID} className="hover:bg-indigo-50/30 transition">
                                    <td className="text-left px-6 py-3 font-bold text-gray-800">{p.studentName}</td>
                                    <td className={`px-4 py-3 font-medium ${Number(p.test1) < 50 ? 'text-red-500' : 'text-blue-600'}`}>{p.test1}</td>
                                    <td className={`px-4 py-3 font-medium ${Number(p.test2) < 50 ? 'text-red-500' : 'text-blue-600'}`}>{p.test2}</td>
                                    <td className="px-4 py-3 font-extrabold text-indigo-900 bg-indigo-50/50">{p.mean}</td>
                                    <td className="px-4 py-3 font-black text-red-600 italic">{p.rank}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="text-center p-20 bg-gray-50 border-2 border-dashed rounded-2xl text-gray-400">
                    No data available for the selected parameters.
                </div>
            )}
        </div>
    );
};

export default SubGradeMatrixPage;
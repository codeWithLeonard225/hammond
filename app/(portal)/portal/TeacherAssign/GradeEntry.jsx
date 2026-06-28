"use client";

import React, { useState, useEffect, useMemo } from "react";
import { db } from "@/app/lib/firebase";
import { pupilresult } from "@/app/lilresult/resultFetch";
import {
    collection,
    onSnapshot,
    query,
    where,
    doc,
    serverTimestamp,
    orderBy,
    limit,
    writeBatch,
} from "firebase/firestore";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";
import { toast } from "react-toastify";

// Helper map to normalize shorthand JSON terms to your Firestore selection strings
const TERM_KEY_MAP = {
    "T1T1": "Term 1 T1",
    "T1T2": "Term 1 T2",
    "T2T1": "Term 2 T1",
    "T2T2": "Term 2 T2",
    "T3T1": "Term 3 T1",
    "T3T2": "Term 3 T2",
};

const JSONBulkGradePage = () => {
    const searchParams = useSearchParams();
    const { user } = useAuth();

    const schoolId = searchParams.get("schoolId") || user?.schoolId || "N/A";

    // --- STATE MANAGEMENT ---
    const [liveTeacherInfo, setLiveTeacherInfo] = useState(null);
    const [assignments, setAssignments] = useState([]);
    const [pupils, setPupils] = useState([]);

    // Filters
    const [selectedClass, setSelectedClass] = useState("");
    const [selectedPupilId, setSelectedPupilId] = useState("");
    const [selectedTest, setSelectedTest] = useState("Term 1 T1");
    const [academicYear, setAcademicYear] = useState("");

    // JSON Input State
    const [jsonInput, setJsonInput] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const isFormTeacher = liveTeacherInfo?.isFormTeacher ?? user?.data?.isFormTeacher;
    const assignedClass = liveTeacherInfo?.assignClass ?? user?.data?.assignClass;

    const tests = ["Term 1 T1", "Term 1 T2", "Term 2 T1", "Term 2 T2", "Term 3 T1", "Term 3 T2"];

    // 1️⃣ Real-time Teacher Verification
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

    // 2️⃣ Fetch Assignments
    useEffect(() => {
        if (!schoolId || schoolId === "N/A") return;
        const qAssignments = query(collection(db, "TeacherAssignments"), where("schoolId", "==", schoolId));

        const unsub = onSnapshot(qAssignments, (snapshot) => {
            const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

            let uniqueAssignments = data.reduce((acc, assignment) => {
                const existing = acc.find(a => a.className === assignment.className);
                if (!existing) acc.push({ ...assignment });
                return acc;
            }, []);

            uniqueAssignments.sort((a, b) => a.className.localeCompare(b.className));

            if (isFormTeacher && assignedClass) {
                uniqueAssignments = uniqueAssignments.filter(a => a.className === assignedClass);
                setSelectedClass(assignedClass);
            } else if (uniqueAssignments.length > 0 && !selectedClass) {
                setSelectedClass(uniqueAssignments[0].className);
            }

            setAssignments(uniqueAssignments);
        });
        return () => unsub();
    }, [schoolId, isFormTeacher, assignedClass, selectedClass]);

    // 3️⃣ Fetch Academic Year
    useEffect(() => {
        const q = query(collection(db, "PupilsReg"), orderBy("academicYear", "desc"), limit(1));
        const unsub = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                setAcademicYear(snapshot.docs[0].data().academicYear);
            }
        });
        return () => unsub();
    }, []);

    // 4️⃣ Fetch Pupils
    useEffect(() => {
        if (!selectedClass || !academicYear || !schoolId || schoolId === "N/A") {
            setPupils([]);
            setSelectedPupilId("");
            return;
        }

        const pupilsQuery = query(
            collection(db, "PupilsReg"),
            where("class", "==", selectedClass),
            where("academicYear", "==", academicYear),
            where("schoolId", "==", schoolId)
        );

        const unsub = onSnapshot(pupilsQuery, (snapshot) => {
            const data = snapshot.docs
                .map((doc) => ({ id: doc.id, studentID: doc.id, ...doc.data() }))
                .sort((a, b) => (a.studentName || "").localeCompare(b.studentName || ""));

            setPupils(data);
            if (data.length > 0 && !selectedPupilId) {
                setSelectedPupilId(data[0].studentID);
            }
        });

        return () => unsub();
    }, [selectedClass, academicYear, schoolId]);

    // 5️⃣ Live Reactive Parse computed directly for the <ul> preview track
    const parsedPreviewList = useMemo(() => {
        if (!jsonInput.trim()) return [];
        try {
            const parsed = JSON.parse(jsonInput);
            if (Array.isArray(parsed)) return parsed;
        } catch (e) {
            // Quietly catch errors during active raw typing variations
        }
        return [];
    }, [jsonInput]);

    // Helper to find score regardless of structural variations ("grade" vs "T2T1")
    const extractGradeValue = (row, currentTestSelection) => {
        if (row.hasOwnProperty("grade")) return row.grade;
        
        const targetJsonTermKey = Object.keys(TERM_KEY_MAP).find(
            (key) => TERM_KEY_MAP[key] === currentTestSelection
        );
        if (targetJsonTermKey && row.hasOwnProperty(targetJsonTermKey)) return row[targetJsonTermKey];
        if (row.hasOwnProperty(currentTestSelection)) return row[currentTestSelection];
        
        return undefined;
    };

    // 6️⃣ Run Bulk Upload Processing
    const handleJsonSubmit = async () => {
        if (!selectedClass || !selectedPupilId || !selectedTest || !academicYear) {
            return toast.error("Please verify all layout target filter categories are complete!");
        }

        if (parsedPreviewList.length === 0) {
            return toast.info("No valid subject objects discovered to sync.");
        }

        if (!window.confirm(`Commit compilation parameters for ${parsedPreviewList.length} track items?`)) return;

        setSubmitting(true);
        const batch = writeBatch(pupilresult);

        try {
            parsedPreviewList.forEach((row) => {
                const subjectName = row.subject;
                const gradeValue = extractGradeValue(row, selectedTest);

                if (!subjectName || gradeValue === undefined) return;

                const parsedGrade = parseFloat(gradeValue);
                if (isNaN(parsedGrade)) return;

                const newDocRef = doc(collection(pupilresult, "PupilGrades"));
                batch.set(newDocRef, {
                    pupilID: selectedPupilId,
                    className: selectedClass,
                    subject: subjectName.trim(),
                    teacher: "Admin JSON Bulk Override",
                    grade: parsedGrade,
                    test: selectedTest,
                    academicYear,
                    schoolId,
                    timestamp: serverTimestamp(),
                    lastModifiedByAdmin: serverTimestamp(),
                });
            });

            await batch.commit();
            setJsonInput("");
            toast.success("Successfully pushed structural JSON records to cloud instances!");
        } catch (err) {
            console.error("Batch error processing input data pipeline", err);
            toast.error("Cloud configuration synchronization rejected structural batch.");
        } finally {
            setSubmitting(false);
        }
    };

    const activeStudentName = pupils.find(p => p.studentID === selectedPupilId)?.studentName || "Select Student";

    return (
        <div className="max-w-4xl mx-auto p-6 bg-white rounded-3xl shadow-2xl relative border border-gray-100">
            {/* Header section */}
            <div className="flex justify-between items-center mb-8 border-b pb-6">
                <div>
                    <h2 className="text-3xl font-black text-indigo-900 uppercase tracking-tight">JSON Bulk Injector</h2>
                    <p className="text-gray-500 font-medium mt-1">
                        Targeting Profile: <span className="text-indigo-600 font-bold">{activeStudentName}</span>
                    </p>
                </div>
            </div>

            {/* Core Configuration Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 p-6 bg-gray-50 rounded-2xl border border-gray-200">
                <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Target Class</label>
                    <select
                        value={selectedClass}
                        onChange={(e) => {
                            setSelectedClass(e.target.value);
                            setSelectedPupilId("");
                        }}
                        disabled={isFormTeacher}
                        className="w-full border-2 border-gray-200 bg-white font-semibold rounded-xl px-4 py-2 text-gray-700 focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                    >
                        <option value="">-- SELECT CLASS --</option>
                        {assignments.map((a) => <option key={a.className} value={a.className}>{a.className}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Pupil Name</label>
                    <select
                        value={selectedPupilId}
                        onChange={(e) => setSelectedPupilId(e.target.value)}
                        disabled={pupils.length === 0}
                        className="w-full border-2 border-gray-200 bg-white font-semibold rounded-xl px-4 py-2 text-gray-700 focus:outline-none focus:border-indigo-500"
                    >
                        <option value="">-- CHOOSE PUPIL --</option>
                        {pupils.map((p) => (
                            <option key={p.studentID} value={p.studentID}>
                                {p.studentName} ({p.studentID})
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Assessment Term / Period</label>
                    <select
                        value={selectedTest}
                        onChange={(e) => setSelectedTest(e.target.value)}
                        className="w-full border-2 border-gray-200 bg-white font-semibold rounded-xl px-4 py-2 text-gray-700 focus:outline-none focus:border-indigo-500"
                    >
                        {tests.map((test, i) => <option key={i} value={test}>{test}</option>)}
                    </select>
                </div>
            </div>

            {/* Raw JSON Data Entry Box */}
            <div className="mb-6">
                <label className="block text-sm font-bold text-indigo-950 mb-2">
                    Paste Raw Array Matrix Payload below:
                </label>

                  <div className="flex justify-end">
                <button
                    onClick={handleJsonSubmit}
                    disabled={submitting || !selectedPupilId || parsedPreviewList.length === 0}
                    className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-bold px-10 py-3 rounded-xl transition-all shadow-lg text-sm uppercase tracking-wider"
                >
                    {submitting ? "Processing Transaction..." : "Commit Batch Arrays"}
                </button>
            </div>
                <textarea
                    rows={8}
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    placeholder={`[\n  { "subject": "Mathematics", "grade": 27 }\n]`}
                    className="w-full p-4 font-mono text-xs bg-slate-900 text-emerald-400 border border-slate-950 rounded-2xl shadow-inner focus:outline-none focus:ring-4 focus:ring-indigo-100"
                />
            </div>

            {/* Live Reactive List Preview Container */}
            {parsedPreviewList.length > 0 && (
                <div className="mb-6 p-5 bg-indigo-50/50 border border-indigo-100 rounded-2xl animate-fadeIn">
                    <h4 className="text-xs font-black text-indigo-900 uppercase tracking-wider mb-3">
                        📋 Live Data Preview ({parsedPreviewList.length} Items Found)
                    </h4>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                        {parsedPreviewList.map((item, idx) => {
                            const score = extractGradeValue(item, selectedTest);
                            return (
                                <li 
                                    key={idx} 
                                    className="flex justify-between items-center text-xs bg-white border border-gray-100 px-3 py-2 rounded-xl shadow-sm"
                                >
                                    <span className="font-semibold text-gray-700 truncate mr-2">
                                        {item.subject || "⚠️ Missing Subject Field"}
                                    </span>
                                    <span className="font-black bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-md min-w-[28px] text-center">
                                        {score !== undefined ? score : "N/A"}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {/* Actions Trigger Component */}
          
        </div>
    );
};

export default JSONBulkGradePage;
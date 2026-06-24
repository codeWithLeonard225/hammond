"use client";

import React, { useState, useEffect, useCallback } from "react";
import { db } from "@/app/lib/firebase";
import { pupilresult } from "@/app/lilresult/resultFetch";
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
    deleteDoc,
    writeBatch,
} from "firebase/firestore";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import localforage from "localforage";
import { toast } from "react-toastify";

const gradesStore = localforage.createInstance({
    name: "GradesAudit",
    storeName: "pupilGradesSheet",
});

const GradeSheetPage = () => {
    const searchParams = useSearchParams();
    const { user } = useAuth();

    const schoolId = searchParams.get("schoolId") || user?.schoolId || "N/A";
    const schoolName = searchParams.get("schoolName") || "School Admin";

    // --- STATE MANAGEMENT ---
    const [liveTeacherInfo, setLiveTeacherInfo] = useState(null);
    const [assignments, setAssignments] = useState([]);
    const [pupils, setPupils] = useState([]);
    const [allSubjectsList, setAllSubjectsList] = useState([]);

    // Filters
    const [selectedClass, setSelectedClass] = useState("");
    const [selectedPupilId, setSelectedPupilId] = useState("");
    const [selectedTest, setSelectedTest] = useState("Term 1 T1");
    const [academicYear, setAcademicYear] = useState("");

    // Grades State for the current targeted Pupil
    const [currentGrades, setCurrentGrades] = useState({});
    const [updatedGrades, setUpdatedGrades] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const isFormTeacher = liveTeacherInfo?.isFormTeacher ?? user?.data?.isFormTeacher;
    const assignedClass = liveTeacherInfo?.assignClass ?? user?.data?.assignClass;

    const tests = ["Term 1 T1", "Term 1 T2", "Term 2 T1", "Term 2 T2", "Term 3 T1", "Term 3 T2"];

    // 1️⃣ Real-time Teacher Info (Form Teacher Lock)
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

    // 2️⃣ Fetch Assignments, Map Available Subjects, and Handle Lock Logic
    useEffect(() => {
        if (!schoolId || schoolId === "N/A") return;
        const qAssignments = query(collection(db, "TeacherAssignments"), where("schoolId", "==", schoolId));

        const unsub = onSnapshot(qAssignments, (snapshot) => {
            const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

            let uniqueAssignments = data.reduce((acc, assignment) => {
                const existing = acc.find(a => a.className === assignment.className);
                if (existing) {
                    assignment.subjects.forEach(subject => {
                        if (!existing.subjects.includes(subject)) existing.subjects.push(subject);
                    });
                } else {
                    acc.push({ ...assignment, subjects: [...assignment.subjects] });
                }
                return acc;
            }, []);

            uniqueAssignments.forEach(a => a.subjects.sort((a, b) => a.localeCompare(b)));
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
    }, [schoolId, isFormTeacher, assignedClass]);

    // Extract subjects dynamically whenever the class changes
    useEffect(() => {
        const currentAssignment = assignments.find(a => a.className === selectedClass);
        if (currentAssignment) {
            setAllSubjectsList(currentAssignment.subjects);
        } else {
            setAllSubjectsList([]);
        }
    }, [selectedClass, assignments]);

    // 3️⃣ Fetch latest academic year
    useEffect(() => {
        const q = query(collection(db, "PupilsReg"), orderBy("academicYear", "desc"), limit(1));
        const unsub = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                setAcademicYear(snapshot.docs[0].data().academicYear);
            }
        });
        return () => unsub();
    }, []);

    // 4️⃣ Fetch pupils list for dropdown filtering
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

    // 5️⃣ Fetch all grades for the selected student across all subjects
    const fetchPupilGradesSheet = useCallback(async () => {
        if (!selectedClass || !selectedPupilId || !selectedTest || !academicYear || !schoolId) {
            setCurrentGrades({});
            return;
        }

        const cacheKey = `sheet_${schoolId}_${selectedClass}_${selectedPupilId}_${selectedTest}_${academicYear}`;

        try {
            const cached = await gradesStore.getItem(cacheKey);
            if (cached) setCurrentGrades(cached);

            const gradeQuery = query(
                collection(pupilresult, "PupilGrades"),
                where("schoolId", "==", schoolId),
                where("className", "==", selectedClass),
                where("pupilID", "==", selectedPupilId),
                where("test", "==", selectedTest),
                where("academicYear", "==", academicYear)
            );

            const snapshot = await getDocs(gradeQuery);
            const gradesMap = {};

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                // Map by subject name since subjects are listed on the left column
                gradesMap[data.subject] = {
                    grade: data.grade,
                    teacher: data.teacher,
                    docId: doc.id
                };
            });

            setCurrentGrades(gradesMap);
            setUpdatedGrades({});
            await gradesStore.setItem(cacheKey, gradesMap);
        } catch (err) {
            console.error("❌ Error fetching terminal sheet grades", err);
        }
    }, [selectedClass, selectedPupilId, selectedTest, academicYear, schoolId]);

    useEffect(() => {
        fetchPupilGradesSheet();
    }, [fetchPupilGradesSheet]);

    const handleGradeChange = (subject, value) => {
        const numValue = parseFloat(value);
        if (value !== "" && (isNaN(numValue) || numValue < 0)) return;

        setUpdatedGrades(prev => {
            const newState = { ...prev, [subject]: value === "" ? null : numValue };
            return newState;
        });
    };

    // Single Row Quick Save
    const handleAdminAction = async (subject) => {
        setSubmitting(true);
        const gradeData = currentGrades[subject];
        const newGradeValue = updatedGrades[subject];

        try {
            if (gradeData && newGradeValue === null) {
                if (!window.confirm(`Delete ${subject} grade?`)) { setSubmitting(false); return; }
                await deleteDoc(doc(pupilresult, "PupilGrades", gradeData.docId));
            } else if (typeof newGradeValue === 'number') {
                if (gradeData) {
                    await setDoc(doc(pupilresult, "PupilGrades", gradeData.docId), {
                        grade: newGradeValue,
                        lastModifiedByAdmin: serverTimestamp(),
                    }, { merge: true });
                } else {
                    const docRef = doc(collection(pupilresult, "PupilGrades"));
                    await setDoc(docRef, {
                        pupilID: selectedPupilId,
                        className: selectedClass,
                        subject: subject,
                        teacher: "Admin Sheet Override",
                        grade: newGradeValue,
                        test: selectedTest,
                        academicYear,
                        schoolId,
                        timestamp: serverTimestamp(),
                        lastModifiedByAdmin: serverTimestamp(),
                    });
                }
            }
            toast.success(`Updated ${subject} grade successfully.`);
            await fetchPupilGradesSheet();
        } catch (err) {
            console.error(err);
            toast.error("Error saving grade change");
        } finally {
            setSubmitting(false);
        }
    };

    // Bulk Save all modified fields for the student
    const handleSubmitAll = async () => {
        const pendingSubjects = Object.keys(updatedGrades);
        if (pendingSubjects.length === 0) return toast.info("No changes to submit");

        if (!window.confirm(`Submit changes for ${pendingSubjects.length} subjects?`)) return;

        setSubmitting(true);
        const batch = writeBatch(pupilresult);

        try {
            pendingSubjects.forEach((subject) => {
                const newValue = updatedGrades[subject];
                const gradeData = currentGrades[subject];

                if (gradeData && newValue === null) {
                    batch.delete(doc(pupilresult, "PupilGrades", gradeData.docId));
                } else if (typeof newValue === "number") {
                    if (gradeData) {
                        batch.set(doc(pupilresult, "PupilGrades", gradeData.docId), {
                            grade: newValue,
                            lastModifiedByAdmin: serverTimestamp(),
                        }, { merge: true });
                    } else {
                        const newDocRef = doc(collection(pupilresult, "PupilGrades"));
                        batch.set(newDocRef, {
                            pupilID: selectedPupilId,
                            className: selectedClass,
                            subject,
                            teacher: "Admin Bulk Sheet Override",
                            grade: newValue,
                            test: selectedTest,
                            academicYear,
                            schoolId,
                            timestamp: serverTimestamp(),
                            lastModifiedByAdmin: serverTimestamp(),
                        });
                    }
                }
            });

            await batch.commit();
            setUpdatedGrades({});
            toast.success("Successfully updated pupil grade sheet!");
            fetchPupilGradesSheet();
        } catch (err) {
            console.error("Bulk sheet override error:", err);
            toast.error("Failed to commit updates");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDownloadPDF = () => {
        const activePupil = pupils.find(p => p.studentID === selectedPupilId);
        const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "A4" });

        doc.setFontSize(16);
        doc.text(`${schoolName} - Student Terminal Grade Sheet`, 40, 40);
        doc.setFontSize(11);
        doc.text(`Student Name: ${activePupil?.studentName || "N/A"} (${selectedPupilId})`, 40, 60);
        doc.text(`Class: ${selectedClass}  |  Assessment: ${selectedTest}  |  Year: ${academicYear}`, 40, 75);

        autoTable(doc, {
            startY: 95,
            head: [['Subject Name', 'Obtained Score', 'Evaluated By']],
            body: allSubjectsList.map((subject) => [
                subject,
                updatedGrades.hasOwnProperty(subject) ? (updatedGrades[subject] ?? "REMOVED") : (currentGrades[subject]?.grade ?? "N/A"),
                currentGrades[subject]?.teacher || "Not Recorded"
            ]),
            theme: "grid"
        });
        doc.save(`GradeSheet_${selectedPupilId}_${selectedTest}.pdf`);
    };

    const activeStudentName = pupils.find(p => p.studentID === selectedPupilId)?.studentName || "Select Student";

    return (
        <div className="max-w-7xl mx-auto p-6 bg-white rounded-3xl shadow-2xl relative border border-gray-100">
            {/* Header section */}
            <div className="flex justify-between items-center mb-8 border-b pb-6">
                <div>
                    <h2 className="text-3xl font-black text-indigo-900 uppercase tracking-tight">Student Grade Sheet</h2>
                    <p className="text-gray-500 font-medium mt-1">
                        Viewing Record for: <span className="text-indigo-600 font-bold">{activeStudentName}</span>
                    </p>
                </div>
                <div className="flex gap-3">
                    {isFormTeacher && (
                        <span className="bg-amber-100 text-amber-700 px-4 py-2 rounded-full text-xs font-bold border border-amber-200 flex items-center">
                            🔒 CLASS LOCKED ({assignedClass})
                        </span>
                    )}

                    {Object.keys(updatedGrades).length > 0 && (
                        <button
                            onClick={handleSubmitAll}
                            disabled={submitting}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-xl font-bold shadow-lg shadow-emerald-200 transition-all flex items-center gap-2"
                        >
                            {submitting ? "Saving..." : `🚀 Save Entire Sheet (${Object.keys(updatedGrades).length})`}
                        </button>
                    )}
                    <button onClick={handleDownloadPDF} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold shadow-lg transition-all">
                        Export PDF
                    </button>
                </div>
            </div>

            {/* Core Configuration Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 p-6 bg-gray-50 rounded-2xl border border-gray-200">
                {/* 1. Class Selection Field */}
                <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Target Class</label>
                    <select
                        value={selectedClass}
                        onChange={(e) => {
                            setSelectedClass(e.target.value);
                            setSelectedPupilId(""); // Reset active target
                        }}
                        disabled={isFormTeacher}
                        className="w-full border-2 border-gray-200 bg-white font-semibold rounded-xl px-4 py-2 text-gray-700 focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                    >
                        <option value="">-- SELECT CLASS --</option>
                        {assignments.map((a) => <option key={a.className} value={a.className}>{a.className}</option>)}
                    </select>
                </div>

                {/* 2. Pupil Name Dropdown Filter */}
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

                {/* 3. Assessment Term Filter */}
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

            {/* Terminal Grade Matrix Layout */}
            <div className="overflow-x-auto shadow-sm rounded-2xl border border-gray-100">
                <table className="min-w-full text-sm text-left">
                    <thead className="bg-indigo-50 text-indigo-900 uppercase text-[11px] font-black">
                        <tr>
                            <th className="px-6 py-4 w-1/3">Subject List</th>
                            <th className="px-6 py-4 text-center w-32">Obtained Grade</th>
                            {/* <th className="px-6 py-4">Assigned Evaluator</th> */}
                            <th className="px-6 py-4 text-center w-40">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {allSubjectsList.length === 0 ? (
                            <tr>
                                <td colSpan="4" className="text-center py-8 font-medium text-gray-400">
                                    No mapped subject tracks found for this configuration.
                                </td>
                            </tr>
                        ) : (
                            allSubjectsList.map((subject) => {
                                const gradeInfo = currentGrades[subject];
                                const displayGrade = updatedGrades.hasOwnProperty(subject) ? (updatedGrades[subject] ?? "") : (gradeInfo?.grade ?? "");
                                const isModified = updatedGrades.hasOwnProperty(subject);

                                return (
                                    <tr key={subject} className="hover:bg-indigo-50/30 transition-all">
                                        {/* Dynamic Left Column - Subjects listed vertically */}
                                        <td className="px-6 py-4 font-bold text-gray-800 tracking-tight">
                                            {subject}
                                        </td>

                                        {/* Score Input Entry */}
                                        {/* <td className="px-6 py-4 text-center">
                                            <input
                                                type="number"
                                                value={displayGrade} 
                                                onChange={(e) => handleGradeChange(subject, e.target.value)}
                                                className={`w-20 border-2 px-2 py-1.5 rounded-lg text-center font-black text-sm focus:ring-2 focus:ring-indigo-400 ${isModified ? "border-amber-400 bg-amber-50 text-amber-900" : "border-gray-200 text-indigo-950"}`}
                                            />
                                        </td> */}

                                        {/* Score Input Entry */}
                                        <td className="px-6 py-4 text-center">
                                            <input
                                                type="number"
                                                value={displayGrade}
                                                onChange={(e) => handleGradeChange(subject, e.target.value)}
                                                // 🔥 ADDED: Intercept Enter keypress for instant single row save
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && isModified && !submitting) {
                                                        e.preventDefault();
                                                        handleAdminAction(subject);
                                                    }
                                                }}
                                                className={`w-20 border-2 px-2 py-1.5 rounded-lg text-center font-black text-sm focus:ring-2 focus:ring-indigo-400 ${isModified ? "border-amber-400 bg-amber-50 text-amber-900" : "border-gray-200 text-indigo-950"}`}
                                            />
                                        </td>

                                        {/* Teacher Info */}
                                        {/* <td className="px-6 py-4">
                                            <span className="text-xs font-medium text-gray-500">
                                                {gradeInfo?.teacher || <span className="text-gray-300 italic">Not set</span>}
                                            </span>
                                        </td> */}

                                        {/* Operations Handling */}
                                        <td className="px-6 py-4 text-center">
                                            {isModified ? (
                                                <button
                                                    onClick={() => handleAdminAction(subject)}
                                                    className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold uppercase shadow-sm transition-all"
                                                    disabled={submitting}
                                                >
                                                    {submitting ? "..." : "Apply"}
                                                </button>
                                            ) : (
                                                <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full font-bold uppercase tracking-wide">
                                                    Synced
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default GradeSheetPage;
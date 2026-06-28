"use client";

import React, { useState, useEffect, useCallback } from "react";
import { db } from "@/app/lib/firebase";
import { pupilresult } from "@/app/lilresult/resultFetch";
import {
    collection,
    onSnapshot,
    query,
    where,
    doc,
    orderBy,
    limit,
    getDocs,
    deleteDoc,
    writeBatch,
} from "firebase/firestore";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";
import { toast } from "react-toastify";

const ManageGradesPage = () => {
    const searchParams = useSearchParams();
    const { user } = useAuth();

    const schoolId = searchParams.get("schoolId") || user?.schoolId || "N/A";

    // --- STATE MANAGEMENT ---
    const [liveTeacherInfo, setLiveTeacherInfo] = useState(null);
    const [assignments, setAssignments] = useState([]);
    const [pupils, setPupils] = useState([]);
    const [fetchedGrades, setFetchedGrades] = useState([]);
    const [loadingGrades, setLoadingGrades] = useState(false);
    
    // Track selected rows for purging
    const [selectedDocIds, setSelectedDocIds] = useState([]);

    // Filters
    const [selectedClass, setSelectedClass] = useState("");
    const [selectedPupilId, setSelectedPupilId] = useState("");
    const [selectedTest, setSelectedTest] = useState("Term 1 T1");
    const [academicYear, setAcademicYear] = useState("");

    const isFormTeacher = liveTeacherInfo?.isFormTeacher ?? user?.data?.isFormTeacher;
    const assignedClass = liveTeacherInfo?.assignClass ?? user?.data?.assignClass;

    const tests = ["Term 1 T1", "Term 1 T2", "Term 2 T1", "Term 2 T2", "Term 3 T1", "Term 3 T2"];

    // Clear selections whenever filters swap
    useEffect(() => {
        setSelectedDocIds([]);
    }, [selectedClass, selectedPupilId, selectedTest]);

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

    // 5️⃣ Fetch Active Grades handler
    const fetchStudentGrades = useCallback(async () => {
        if (!selectedClass || !selectedPupilId || !selectedTest || !academicYear || !schoolId) {
            setFetchedGrades([]);
            return;
        }

        setLoadingGrades(true);
        try {
            const gradeQuery = query(
                collection(pupilresult, "PupilGrades"),
                where("schoolId", "==", schoolId),
                where("className", "==", selectedClass),
                where("pupilID", "==", selectedPupilId),
                where("test", "==", selectedTest),
                where("academicYear", "==", academicYear)
            );

            const snapshot = await getDocs(gradeQuery);
            const gradesList = snapshot.docs.map(doc => ({
                docId: doc.id,
                ...doc.data()
            })).sort((a, b) => (a.subject || "").localeCompare(b.subject || ""));

            setFetchedGrades(gradesList);
        } catch (err) {
            console.error("❌ Error running parameters fetch operation:", err);
            toast.error("Failed to load grade documents");
        } finally {
            setLoadingGrades(false);
        }
    }, [selectedClass, selectedPupilId, selectedTest, academicYear, schoolId]);

    useEffect(() => {
        fetchStudentGrades();
    }, [fetchStudentGrades]);

    // 6️⃣ Handle Row Selection Toggles
    const handleSelectRow = (docId) => {
        setSelectedDocIds(prev => 
            prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
        );
    };

    const handleSelectAllToggle = () => {
        if (selectedDocIds.length === fetchedGrades.length) {
            setSelectedDocIds([]);
        } else {
            setSelectedDocIds(fetchedGrades.map(g => g.docId));
        }
    };

    // 7️⃣ Delete Selection Action (Single or Bulk)
    const handleDeleteSelectedGrades = async () => {
        if (selectedDocIds.length === 0) return;

        const count = selectedDocIds.length;
        if (!window.confirm(`Are you absolutely sure you want to permanently delete the ${count} selected grade document(s)?`)) return;

        setLoadingGrades(true);
        try {
            // Firestore Batched Write for high efficiency execution 
            const batch = writeBatch(pupilresult);
            
            selectedDocIds.forEach((id) => {
                const docRef = doc(pupilresult, "PupilGrades", id);
                batch.delete(docRef);
            });

            await batch.commit();
            toast.success(`Successfully purged ${count} subject document entries.`);
            setSelectedDocIds([]); // Flush selection state
            fetchStudentGrades();  // Re-sync UI state
        } catch (err) {
            console.error("Batch deletion query failed:", err);
            toast.error("Could not strip records from cloud target schema.");
        } finally {
            setLoadingGrades(false);
        }
    };

    const activeStudentName = pupils.find(p => p.studentID === selectedPupilId)?.studentName || "Select Student";

    return (
        <div className="max-w-4xl mx-auto p-6 bg-white rounded-3xl shadow-2xl relative border border-gray-100">
            {/* Header section */}
            <div className="flex justify-between items-center mb-8 border-b pb-6">
                <div>
                    <h2 className="text-3xl font-black text-indigo-900 uppercase tracking-tight">Grade Document Purger</h2>
                    <p className="text-gray-500 font-medium mt-1">
                        Reviewing Profile: <span className="text-indigo-600 font-bold">{activeStudentName}</span>
                    </p>
                </div>

                {/* Bulk Action Context Button */}
                {selectedDocIds.length > 0 && (
                    <button
                        onClick={handleDeleteSelectedGrades}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-black text-sm px-5 py-2.5 rounded-xl shadow-lg shadow-rose-200 transition-all uppercase tracking-wider inline-flex items-center gap-2 animate-fade-in"
                    >
                        🗑️ Delete Selected ({selectedDocIds.length})
                    </button>
                )}
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

            {/* Display Interactive Matrix Table */}
            <div className="overflow-x-auto shadow-sm rounded-2xl border border-gray-100">
                <table className="min-w-full text-sm text-left">
                    <thead className="bg-rose-50 text-rose-900 uppercase text-[11px] font-black">
                        <tr>
                            <th className="px-6 py-4 w-12 text-center">
                                <input 
                                    type="checkbox"
                                    className="accent-rose-600 rounded cursor-pointer w-4 h-4"
                                    checked={fetchedGrades.length > 0 && selectedDocIds.length === fetchedGrades.length}
                                    onChange={handleSelectAllToggle}
                                    disabled={loadingGrades || fetchedGrades.length === 0}
                                />
                            </th>
                            <th className="px-6 py-4">Subject Field</th>
                            <th className="px-6 py-4 text-center w-32">Grade Score</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {loadingGrades ? (
                            <tr>
                                <td colSpan="3" className="text-center py-8 font-medium text-gray-400 italic">
                                    Querying live cloud documents...
                                </td>
                            </tr>
                        ) : fetchedGrades.length === 0 ? (
                            <tr>
                                <td colSpan="3" className="text-center py-8 font-medium text-gray-400">
                                    No active data documents registered under this tracking query.
                                </td>
                            </tr>
                        ) : (
                            fetchedGrades.map((gradeDoc) => {
                                const isChecked = selectedDocIds.includes(gradeDoc.docId);
                                return (
                                    <tr 
                                        key={gradeDoc.docId} 
                                        className={`transition-all duration-150 cursor-pointer ${isChecked ? 'bg-rose-50/50 hover:bg-rose-50' : 'hover:bg-rose-50/20'}`}
                                        onClick={() => handleSelectRow(gradeDoc.docId)}
                                    >
                                        <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                            <input 
                                                type="checkbox"
                                                className="accent-rose-600 rounded cursor-pointer w-4 h-4"
                                                checked={isChecked}
                                                onChange={() => handleSelectRow(gradeDoc.docId)}
                                            />
                                        </td>
                                        <td className="px-6 py-4 font-bold text-gray-800 tracking-tight">
                                            {gradeDoc.subject}
                                        </td>
                                        <td className="px-6 py-4 text-center font-black text-indigo-950">
                                            {gradeDoc.grade}
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

export default ManageGradesPage;
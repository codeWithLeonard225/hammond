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
    writeBatch, // Add this
} from "firebase/firestore";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";
import jsPDF from "jspdf"; 
import autoTable from "jspdf-autotable";
import localforage from "localforage";
import { toast } from "react-toastify";

// Initialize localforage store
const gradesStore = localforage.createInstance({
    name: "GradesAudit",
    storeName: "pupilGrades",
});

const GradesAuditPage = () => {
    const searchParams = useSearchParams();
    const { user } = useAuth();
    
    // Extract school details
    const schoolId = searchParams.get("schoolId") || user?.schoolId || "N/A";
    const schoolName = searchParams.get("schoolName") || "School Admin";

    // --- STATE MANAGEMENT ---
    const [liveTeacherInfo, setLiveTeacherInfo] = useState(null);
    const [allTeachers, setAllTeachers] = useState([]);
    const [selectedTeacherName, setSelectedTeacherName] = useState(""); 
    const [currentGrades, setCurrentGrades] = useState({}); 
    const [updatedGrades, setUpdatedGrades] = useState({}); 
    const [assignments, setAssignments] = useState([]);
    const [pupils, setPupils] = useState([]);
    const [selectedClass, setSelectedClass] = useState("");
    const [selectedSubject, setSelectedSubject] = useState("");
    const [selectedTest, setSelectedTest] = useState("Term 1 T1");
    const [academicYear, setAcademicYear] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // Form Teacher Lock Values
    const isFormTeacher = liveTeacherInfo?.isFormTeacher ?? user?.data?.isFormTeacher;
    const assignedClass = liveTeacherInfo?.assignClass ?? user?.data?.assignClass;

    const tests = ["Term 1 T1", "Term 1 T2", "Term 2 T1", "Term 2 T2","Term 3 T1", "Term 3 T2"];

    // --- 1️⃣ Real-time Teacher Info (Form Teacher Lock) ---
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

    // --- 2️⃣ Fetch Assignments & Apply Lock Logic ---
    useEffect(() => {
        if (!schoolId || schoolId === "N/A") return;
        const qAssignments = query(
            collection(db, "TeacherAssignments"),
            where("schoolId", "==", schoolId)
        );

        const unsub = onSnapshot(qAssignments, (snapshot) => {
            const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            const uniqueTeachers = [...new Set(data.map(a => a.teacher))].sort();
            setAllTeachers(uniqueTeachers);

            let uniqueAssignments = data.reduce((acc, assignment) => {
                const existing = acc.find(a => a.className === assignment.className);
                if (existing) {
                    assignment.subjects.forEach(subject => {
                        if (!existing.subjects.includes(subject)) {
                            existing.subjects.push(subject);
                        }
                    });
                } else {
                    acc.push({ ...assignment, subjects: [...assignment.subjects] });
                }
                return acc;
            }, []).sort((a, b) => a.className.localeCompare(b.className));

            // 🔥 APPLY LOCK LOGIC: Filter assignments if Form Teacher
            if (isFormTeacher && assignedClass) {
                uniqueAssignments = uniqueAssignments.filter(a => a.className === assignedClass);
                setSelectedClass(assignedClass);
                if (uniqueAssignments.length > 0) setSelectedSubject(uniqueAssignments[0].subjects[0]);
            } else {
                if (uniqueAssignments.length > 0 && !selectedClass) {
                    setSelectedClass(uniqueAssignments[0].className);
                    setSelectedSubject(uniqueAssignments[0].subjects[0]);
                }
            }
            
            setAssignments(uniqueAssignments);
        });
        return () => unsub();
    }, [schoolId, isFormTeacher, assignedClass]);

    // --- 3️⃣ Fetch latest academic year ---
    useEffect(() => {
        const q = query(collection(db, "PupilsReg"), orderBy("academicYear", "desc"), limit(1));
        const unsub = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                setAcademicYear(snapshot.docs[0].data().academicYear);
            }
        });
        return () => unsub();
    }, []);

    // --- 4️⃣ Fetch pupils for selected class ---
    useEffect(() => {
        if (!selectedClass || !academicYear || !schoolId || schoolId === "N/A") {
            setPupils([]);
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

            gradesStore.getItem("pendingUpdates").then((pending) => {
                if (pending) setUpdatedGrades(pending);
            });
        });

        return () => unsub();
    }, [selectedClass, academicYear, schoolId]);

    // --- 5️⃣ Fetch grades with caching ---
    const fetchGrades = useCallback(async () => {
        if (!selectedClass || !selectedSubject || !selectedTest || !academicYear || !schoolId) return;

        const cacheKey = `${schoolId}_${selectedClass}_${selectedSubject}_${selectedTest}_${academicYear}`;

        try {
            const cachedGrades = await gradesStore.getItem(cacheKey);
            if (cachedGrades) setCurrentGrades(cachedGrades);

            let gradeQuery = query(
                collection(pupilresult, "PupilGrades"),
                where("className", "==", selectedClass),
                where("subject", "==", selectedSubject),
                where("test", "==", selectedTest),
                where("academicYear", "==", academicYear),
                where("schoolId", "==", schoolId),
            );

            if (selectedTeacherName) {
                gradeQuery = query(gradeQuery, where("teacher", "==", selectedTeacherName));
            }

            const snapshot = await getDocs(gradeQuery);
            const gradesMap = {};
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                gradesMap[data.pupilID] = { 
                    grade: data.grade, 
                    teacher: data.teacher,
                    docId: doc.id
                };
            });

            setCurrentGrades(gradesMap);
            setUpdatedGrades({});
            await gradesStore.setItem(cacheKey, gradesMap);
        } catch (err) {
            console.error("❌ Error fetching grades", err);
        }
    }, [selectedClass, selectedSubject, selectedTest, academicYear, schoolId, selectedTeacherName]);

    useEffect(() => {
        fetchGrades();
    }, [fetchGrades]);

    const handleGradeChange = (pupilID, value) => {
        const numValue = parseFloat(value);
        if (value !== "" && (isNaN(numValue) || numValue < 0)) return;

        setUpdatedGrades(prev => {
            const newState = { ...prev, [pupilID]: value === "" ? null : numValue };
            gradesStore.setItem("pendingUpdates", newState);
            return newState;
        });
    };


    // --- NEW: Submit All Grades at Once ---
   const handleSubmitAll = async () => {
    const pendingIDs = Object.keys(updatedGrades);
    if (pendingIDs.length === 0) return toast.info("No changes to submit");
    
    if (!window.confirm(`Are you sure you want to submit ${pendingIDs.length} changes at once?`)) return;

    setSubmitting(true);
    // 2. Initialize batch with the correct firestore instance
    const batch = writeBatch(pupilresult); 

    try {
        pendingIDs.forEach((pupilID) => {
            const newValue = updatedGrades[pupilID];
            const gradeData = currentGrades[pupilID];

            if (gradeData && newValue === null) {
                // DELETE: Use pupilresult consistently
                batch.delete(doc(pupilresult, "PupilGrades", gradeData.docId));
            } else if (typeof newValue === "number") {
                if (gradeData) {
                    // UPDATE
                    batch.set(doc(pupilresult, "PupilGrades", gradeData.docId), {
                        grade: newValue,
                        lastModifiedByAdmin: serverTimestamp(),
                    }, { merge: true });
                } else {
                    // CREATE: Ensure the collection path matches your database structure
                    const newDocRef = doc(collection(pupilresult, "PupilGrades"));
                    batch.set(newDocRef, {
                        pupilID,
                        className: selectedClass,
                        subject: selectedSubject,
                        teacher: "Admin Bulk Override",
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
        
        // 3. Cleanup state and cache
        setUpdatedGrades({});
        await gradesStore.setItem("pendingUpdates", {});
        toast.success("Successfully submitted all changes!");
        fetchGrades(); 
    } catch (err) {
        console.error("Bulk upload error:", err);
        toast.error("Failed to submit all grades");
    } finally {
        setSubmitting(false);
    }
};


    const handleAdminAction = async (pupilID) => {
        setSubmitting(true);
        const gradeData = currentGrades[pupilID];
        const newGradeValue = updatedGrades[pupilID];

        try {
            if (gradeData && newGradeValue === null) {
                if (!window.confirm(`Delete grade for ${pupilID}?`)) { setSubmitting(false); return; }
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
                        pupilID,
                        className: selectedClass,
                        subject: selectedSubject,
                        teacher: "Admin Override",
                        grade: newGradeValue,
                        test: selectedTest,
                        academicYear,
                        schoolId,
                        timestamp: serverTimestamp(),
                        lastModifiedByAdmin: serverTimestamp(),
                    });
                }
            }
            await fetchGrades();
        } catch (err) {
            console.error(err);
        } finally {
            setSubmitting(false);
            setUpdatedGrades(prev => {
                const newState = { ...prev };
                delete newState[pupilID];
                gradesStore.setItem("pendingUpdates", newState);
                return newState;
            });
        }
    };

    const handleDownloadPDF = () => {
        const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "A4" });
        autoTable(doc, {
            startY: 50,
            head: [['#', 'Student Name', 'ID', 'Grade', 'Submitted By']],
            body: pupils.map((p, i) => [
                i + 1, 
                p.studentName, 
                p.studentID, 
                updatedGrades.hasOwnProperty(p.studentID) ? (updatedGrades[p.studentID] ?? "DELETED") : (currentGrades[p.studentID]?.grade ?? "N/A"),
                currentGrades[p.studentID]?.teacher || "N/A"
            ]),
            theme: "striped"
        });
        doc.save(`Audit_${selectedClass}_${selectedSubject}.pdf`);
    };

    return (
        <div className="max-w-7xl mx-auto p-6 bg-white rounded-3xl shadow-2xl relative border border-gray-100">
            <div className="flex justify-between items-center mb-8 border-b pb-6">
                <div>
                    <h2 className="text-3xl font-black text-indigo-900 uppercase">Grade Audit</h2>
                    <p className="text-gray-500 font-medium">Class: <span className="text-indigo-600 font-bold">{selectedClass}</span> | Subject: <span className="text-emerald-600 font-bold">{selectedSubject}</span></p>
                </div>
                <div className="flex gap-3">
                   {isFormTeacher && (
                       <span className="bg-amber-100 text-amber-700 px-4 py-2 rounded-full text-xs font-bold border border-amber-200">
                           🔒 CLASS LOCKED
                       </span>
                   )}

                   {Object.keys(updatedGrades).length > 0 && (
                        <button
                            onClick={handleSubmitAll}
                            disabled={submitting}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-xl font-bold shadow-lg shadow-emerald-200 transition-all flex items-center gap-2"
                        >
                            {submitting ? "Processing..." : `🚀 Submit All (${Object.keys(updatedGrades).length})`}
                        </button>
                    )}
                   <button onClick={handleDownloadPDF} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold shadow-lg transition-all">
                       Export PDF
                   </button>
                </div>
            </div>

            {/* Filter Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 p-6 bg-gray-50 rounded-2xl border border-gray-200">
                <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Submitted By (Teacher)</label>
                    <select
                        value={selectedTeacherName}
                        onChange={(e) => setSelectedTeacherName(e.target.value)}
                        className="w-full border-2 border-gray-200 rounded-xl px-4 py-2"
                    >
                        <option value="">-- ALL TEACHERS --</option>
                        {allTeachers.map((name, i) => <option key={i} value={name}>{name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Assessment Period</label>
                    <select
                        value={selectedTest}
                        onChange={(e) => setSelectedTest(e.target.value)}
                        className="w-full border-2 border-gray-200 rounded-xl px-4 py-2"
                    >
                        {tests.map((test, i) => <option key={i} value={test}>{test}</option>)}
                    </select>
                </div>
            </div>

            {/* Class & Subject Tabs (Locked if Form Teacher) */}
            <div className="mb-8">
                <p className="text-xs font-bold text-indigo-400 mb-3 uppercase tracking-widest">Select Class</p>
                <div className="flex gap-2 flex-wrap">
                    {assignments.map((a) => (
                        <button key={a.className}
                            disabled={isFormTeacher}
                            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${selectedClass === a.className ? "bg-indigo-600 text-white shadow-lg" : "bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50"}`}
                            onClick={() => { setSelectedClass(a.className); setSelectedSubject(a.subjects[0]); }}>
                            {a.className}
                        </button>
                    ))}
                </div>

                <p className="text-xs font-bold text-emerald-400 mb-3 mt-6 uppercase tracking-widest">Select Subject</p>
                <div className="flex gap-2 flex-wrap">
                    {assignments.find((a) => a.className === selectedClass)?.subjects.map((subject, i) => (
                        <button key={i} className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${selectedSubject === subject ? "bg-emerald-600 text-white shadow-lg" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`} onClick={() => setSelectedSubject(subject)}>
                            {subject}
                        </button>
                    ))}
                </div>
            </div>

            {/* Audit Table */}
            <div className="overflow-x-auto shadow-sm rounded-2xl border border-gray-100">
                <table className="min-w-full text-sm text-left">
                    <thead className="bg-indigo-50 text-indigo-900 uppercase text-[11px] font-black">
                        <tr>
                            <th className="px-6 py-4">Student Details</th>
                            <th className="px-6 py-4 text-center">Current Grade</th>
                            <th className="px-6 py-4">Submission Info</th>
                            <th className="px-6 py-4 text-center">Admin Override</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {pupils.map((pupil, index) => {
                            const gradeInfo = currentGrades[pupil.studentID];
                            const displayGrade = updatedGrades.hasOwnProperty(pupil.studentID) ? (updatedGrades[pupil.studentID] ?? "") : (gradeInfo?.grade ?? "");
                            const isModified = updatedGrades.hasOwnProperty(pupil.studentID);

                            return (
                                <tr key={pupil.id} className="hover:bg-indigo-50/30 transition-all">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-gray-900">{pupil.studentName}</div>
                                        <div className="text-[10px] text-gray-400 uppercase">{pupil.studentID}</div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <input
                                            type="number"
                                            value={displayGrade} 
                                            onChange={(e) => handleGradeChange(pupil.studentID, e.target.value)}
                                            className={`w-16 border-2 px-2 py-1 rounded-lg text-center font-bold focus:ring-2 focus:ring-indigo-400 ${isModified ? "border-amber-400 bg-amber-50" : "border-gray-100"}`}
                                        />
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs text-gray-500 italic">{gradeInfo?.teacher || "Not Submitted"}</span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {isModified ? (
                                            <button
                                                onClick={() => handleAdminAction(pupil.studentID)}
                                                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-1 rounded-lg text-xs font-bold uppercase shadow-md transition-all"
                                                disabled={submitting}
                                            >
                                                {submitting ? "..." : "Save Change"}
                                            </button>
                                        ) : (
                                            <span className="text-[10px] text-gray-300 font-bold uppercase tracking-tighter">Verified</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default GradesAuditPage;
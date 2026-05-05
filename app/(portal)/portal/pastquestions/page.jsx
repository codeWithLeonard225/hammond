"use client";

import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import { db } from "@/app/lib/firebase"; 
import { schoollpq } from "@/app/lilschoollpq/schoollpq";

import {
    collection,
    onSnapshot,
    query,
    where,
    getDocs,
} from "firebase/firestore";

// -------------------- Modal Component --------------------
const ImageViewerModal = ({ record, onClose }) => {
    if (!record || record.pages.length === 0) return null;

    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const currentPage = record.pages[currentPageIndex];
    const totalPages = record.pages.length;

    return (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full h-[90vh] flex flex-col overflow-hidden shadow-2xl">
                
                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-gray-800 truncate">
                        {record.subject} - {record.testType}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-red-600 transition text-2xl font-bold p-1"
                    >
                        &times;
                    </button>
                </div>

                {/* Image Viewer */}
                <div className="flex-1 p-2 flex items-center justify-center overflow-auto bg-gray-100">
                    <img
                        src={currentPage.url}
                        alt={`Page ${currentPageIndex + 1}`}
                        className="max-w-full max-h-full object-contain"
                        loading="lazy"
                    />
                </div>

                {/* Navigation */}
                <div className="p-4 border-t flex justify-center items-center space-x-4 bg-gray-50">
                    <button
                        onClick={() => setCurrentPageIndex(prev => Math.max(0, prev - 1))}
                        disabled={currentPageIndex === 0}
                        className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400 hover:bg-blue-600 transition"
                    >
                        ← Previous
                    </button>

                    <span className="font-medium text-gray-700">
                        Page {currentPageIndex + 1} of {totalPages}
                    </span>

                    <button
                        onClick={() => setCurrentPageIndex(prev => Math.min(totalPages - 1, prev + 1))}
                        disabled={currentPageIndex === totalPages - 1}
                        className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400 hover:bg-blue-600 transition"
                    >
                        Next →
                    </button>
                </div>
            </div>
        </div>
    );
};
// --------------------------------------------------------------

export default function PupilPastQuestionViewer() {
    const router = useRouter();

    const [pupilData, setPupilData] = useState({});
    const [pqRecords, setPqRecords] = useState([]);
    const [latestInfo, setLatestInfo] = useState({ class: "", academicYear: "" });
    const [classesCache, setClassesCache] = useState([]);
    const [loading, setLoading] = useState(true);

    const [modalRecord, setModalRecord] = useState(null);

    // -------------------- LOAD PUPIL FROM LOCAL STORAGE --------------------
    useEffect(() => {
        try {
            const stored = localStorage.getItem("SchoolAppUser");
            if (stored) {
                const parsed = JSON.parse(stored);
                setPupilData(parsed);
            } else {
                toast.error("No pupil data found. Please log in again.");
                router.push("/login");
            }
        } catch (err) {
            console.error(err);
        }
    }, []);

    const schoolId = pupilData?.schoolId || "";

    // -------------------- 1. LOAD CLASS CACHE --------------------
    useEffect(() => {
        if (!schoolId) return;

        const CACHE_KEY = `classes_config_${schoolId}`;
        const CACHE_DURATION = 24 * 60 * 60 * 1000;

        const loadClasses = async () => {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                try {
                    const { timestamp, data } = JSON.parse(cached);
                    if (Date.now() - timestamp < CACHE_DURATION) {
                        setClassesCache(data);
                        return;
                    }
                } catch {}
            }

            try {
                const snapshot = await getDocs(
                    query(collection(db, "Classes"), where("schoolId", "==", schoolId))
                );

                const data = snapshot.docs.map(doc => doc.data());
                setClassesCache(data);

                localStorage.setItem(
                    CACHE_KEY,
                    JSON.stringify({ timestamp: Date.now(), data })
                );

            } catch (err) {
                console.error("Error fetching class cache:", err);
            }
        };

        loadClasses();
    }, [schoolId]);

    // -------------------- 2. FETCH CURRENT CLASS & ACADEMIC YEAR --------------------
    useEffect(() => {
        if (!pupilData.studentID || !schoolId) return;

        const q = query(
            collection(db, "PupilsReg"),
            where("studentID", "==", pupilData.studentID),
            where("schoolId", "==", schoolId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const data = snapshot.docs[0].data();
                setLatestInfo({
                    class: data.class,
                    academicYear: data.academicYear,
                });
            } else {
                toast.warn("Registration not found.");
            }
            setLoading(false);
        });

        return () => unsubscribe();

    }, [pupilData.studentID, schoolId]);

    // -------------------- 3. FETCH PAST QUESTIONS --------------------
    useEffect(() => {
        if (!schoolId || !latestInfo.class) return;

        const q = query(
            collection(schoollpq, "SchoolPastQuestions"),
            where("schoolId", "==", schoolId),
            where("className", "==", latestInfo.class)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({
                id: doc.id, 
                ...doc.data()
            }));

            data.sort((a, b) => a.subject.localeCompare(b.subject));
            setPqRecords(data);
        });

        return () => unsubscribe();
    }, [schoolId, latestInfo.class]);

    // -------------------- VIEW PAPER --------------------
    const handleViewPaper = (record) => {
        if (!record.pages || record.pages.length === 0) {
            toast.warn("No pages uploaded for this paper.");
            return;
        }
        setModalRecord(record);
    };

    // -------------------- UI --------------------
    if (loading) {
        return (
            <div className="text-center p-8">
                <p className="text-lg font-medium text-gray-700">Loading pupil information...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center min-h-screen bg-gray-50 p-6">
            <h2 className="text-3xl font-bold text-center mb-2 text-blue-700">
                📚 School Past Questions
            </h2>

            <h3 className="text-xl font-medium text-center mb-6 text-gray-600">
                Viewing for {pupilData.studentName} ({latestInfo.class} - {latestInfo.academicYear})
            </h3>

            <div className="bg-white shadow-xl rounded-2xl p-6 w-full max-w-4xl">
                <p className="text-lg font-semibold border-b pb-3 mb-4 text-purple-600">
                    Past Questions for <span className="text-gray-800">{latestInfo.class}</span>
                </p>

                {pqRecords.length === 0 ? (
                    <div className="text-center py-8 bg-yellow-50 rounded-lg">
                        <p className="text-lg text-gray-700 font-medium">
                            No past question papers uploaded yet for this class.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {pqRecords.map((record) => (
                            <div 
                                key={record.id}
                                className="border border-gray-200 rounded-xl p-4 shadow-md hover:shadow-lg transition bg-white"
                            >
                                <p className="text-sm text-gray-500">
                                    {record.academicYear} • {record.testType}
                                </p>
                                <h4 className="text-xl font-bold text-gray-800 mt-1">
                                    {record.subject}
                                </h4>

                                <p className="text-sm text-gray-600 mt-1">
                                    <span className="font-semibold">Pages:</span> {record.pages?.length}
                                </p>
                                <p className="text-sm text-gray-600">
                                    <span className="font-semibold">Uploaded By:</span> {record.uploadedBy}
                                </p>

                                <button
                                    onClick={() => handleViewPaper(record)}
                                    className="mt-4 w-full bg-green-500 text-white py-2 rounded-lg font-semibold hover:bg-green-600 transition"
                                >
                                    View Paper
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {modalRecord && (
                <ImageViewerModal 
                    record={modalRecord}
                    onClose={() => setModalRecord(null)}
                />
            )}
        </div>
    );
}

"use client";

import React, { useState, useEffect } from "react";
import {
  MdDashboard,
  MdAttachMoney,
  MdAssignmentTurnedIn,
  MdKeyboardArrowDown,
  MdMenuBook,
  MdLogout,
  MdPeople,
  MdBarChart,
  MdVerifiedUser,
} from "react-icons/md";

import { useAuth } from "@/app/context/AuthContext";
import { useRouter } from "next/navigation";
import TeacherGradesPage from "../../TeacherAssign/TeacherGradesPage";
import StaffSelfAttendanceReport from "../../TeacherAssign/StaffSelfAttendanceReport";
import TeacherQuestionsPageObjectives from "../../TeacherAssign/TeacherQuestionsPageObjectives";
import TeacherQuestionsPageTheory from "../../TeacherAssign/TeacherQuestionsPageTheory";
import TeacherTimetableReport from "../../TeacherAssign/TeacherTimetableReport";
import TeacherGradesDashboard from "../../TeacherAssign/TeacherGradesDashboard";
// Import the GradeSheetPage you created earlier
import SubmittedGrades from "../../TeacherAssign/SubmittedGrades"; 

import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import SubGradeMatrixPage from "../../TeacherAssign/SubGradeMatrixPage";
import TermResult from "../../TeacherAssign/TermResult";
import YearlyResult from "../../TeacherAssign/YearlyResult";
import GradesAuditPage from "../../TeacherAssign/GradesAuditPage";
import ReportCard from "../../TeacherAssign/ReportCard";
import GradeEntry from "../../TeacherAssign/GradeEntry";
import SubjectGradeDeleteEntry from "../../TeacherAssign/SubjectGradeDeleteEntry";


const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: <MdDashboard /> },
  { key: "grades", label: "Upload Grades", icon: <MdAttachMoney /> },
  { key: "gradesDashboard", label: "Grades Dashboard", icon: <MdAttachMoney /> },
  {
    key: "questions",
    label: "Question Bank",
    icon: <MdAssignmentTurnedIn />,
    children: [
      { key: "objectives", label: "Objectives" },
      { key: "theory", label: "Theory" },
      { key: "assignment", label: "Assignment" },
    ],
  },
  { key: "Timetable", label: "Class Timetable", icon: <MdMenuBook /> },
  {
    key: "pupilResults",
    label: "Pupils Results",
    icon: <MdBarChart />,
    requiresFormTeacher: true,
    children: [
      { key: "SubmittedGrades", label: "Submitted grades" },
      { key: "GradeSheet", label: "Grade Sheet" },
      { key: "GradeEntry", label: "Grade Manuel" },
      { key: "SubjectGradeDeleteEntry", label: "Subject Delete" },
      { key: "GradesAuditPage", label: "GradesAuditPage" },
      { key: "ReportCard", label: "Report Cards" },
      { key: "TermResult", label: "Term Result" },
      { key: "YearlyResult", label: "Yearly Result" },
    ],
  },
  { 
    key: "attendance", 
    label: "Class Attendance", 
    icon: <MdPeople />,
    requiresFormTeacher: true 
  },
];

const Button = ({ variant = "default", onClick, className = "", children }) => {
  let baseStyles = "inline-flex items-center justify-start whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-950 disabled:pointer-events-none disabled:opacity-50";
  let variantStyles = variant === "default" ? "bg-indigo-600 text-white shadow hover:bg-indigo-700" : "hover:bg-indigo-100 hover:text-indigo-700 text-gray-700";

  return (
    <button onClick={onClick} className={`${baseStyles} ${variantStyles} ${className} h-9 px-4 py-2 justify-start`}>
      {children}
    </button>
  );
};

export default function SubjectTeacherDashboard() {
  // --- 1. ALL HOOKS AT THE TOP ---
  const { user, setUser, loading: authLoading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState("dashboard");
  const [openDropdown, setOpenDropdown] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [teacherInfo, setTeacherInfo] = useState(null);
  const [formattedDate, setFormattedDate] = useState("");

  // Fix Hydration: Set date only after mount
  useEffect(() => {
    setFormattedDate(new Date().toLocaleDateString('en-GB', { dateStyle: 'full' }));
  }, []);

  // Fetch Teacher Firestore Data
  useEffect(() => {
    if (!user || user.role !== "teacher") return;

    const q = query(
      collection(db, "Teachers"),
      where("teacherID", "==", user.data.teacherID),
      where("schoolId", "==", user.schoolId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setTeacherInfo({
          id: snapshot.docs[0].id,
          ...snapshot.docs[0].data(),
        });
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Handle Session Redirect
  useEffect(() => {
    if (!authLoading) {
      if (!user || user.role !== "teacher") {
        router.replace("/login");
      }
    }
  }, [user, authLoading, router]);

  // --- 2. CONDITIONAL RETURNS AFTER HOOKS ---
  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <p className="text-xl font-semibold text-indigo-700">Verifying Session...</p>
      </div>
    );
  }

  if (!teacherInfo) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="animate-pulse text-indigo-600">Loading teacher profile...</p>
      </div>
    );
  }

  // --- 3. DERIVED LOGIC ---
  const { data: teacherData, schoolName, schoolLogoUrl } = user;
  const teacherName = teacherData.teacherName || "Teacher";
  const isFormTeacher = teacherInfo?.isFormTeacher || false;
  const assignedClass = teacherInfo?.assignClass || "No Class Assigned";
  const initials = teacherName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const filteredNavItems = NAV_ITEMS.filter(item => {
    if (item.requiresFormTeacher && !isFormTeacher) return false;
    return true;
  });

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("schoolUser");
    router.replace("/login");
  };

  const renderNavItems = (items) =>
    items.map((item) => (
      <div key={item.key} className="mb-1">
        {item.children ? (
          <>
            <Button
              variant={openDropdown === item.key ? "default" : "ghost"}
              onClick={() => setOpenDropdown(openDropdown === item.key ? null : item.key)}
              className="w-full flex items-center justify-between gap-2 text-base py-2"
            >
              <div className="flex items-center gap-2">{item.icon} {item.label}</div>
              <MdKeyboardArrowDown className={`transition-transform ${openDropdown === item.key ? "rotate-180" : ""}`} />
            </Button>
            {openDropdown === item.key && (
              <div className="pl-6 mt-1 space-y-1">
                {item.children.map((child) => (
                  <Button
                    key={child.key}
                    variant={activeTab === child.key ? "default" : "ghost"}
                    onClick={() => setActiveTab(child.key)}
                    className="w-full text-sm py-1"
                  >
                    {child.label}
                  </Button>
                ))}
              </div>
            )}
          </>
        ) : (
          <Button
            variant={activeTab === item.key ? "default" : "ghost"}
            onClick={() => { setActiveTab(item.key); setOpenDropdown(null); }}
            className="w-full flex items-center gap-2 text-base py-2"
          >
            {item.icon} {item.label}
          </Button>
        )}
      </div>
    ));

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard": return <StaffSelfAttendanceReport />;
      case "grades": return <TeacherGradesPage />;
      case "gradesDashboard": return <TeacherGradesDashboard />;
      case "objectives": return <TeacherQuestionsPageObjectives />;
      case "theory": return <TeacherQuestionsPageTheory />;
      case "Timetable": return <TeacherTimetableReport />;
      case "SubmittedGrades": return <SubmittedGrades />; // ⭐️ Integrated your new page
      case "GradeSheet": return <SubGradeMatrixPage />; // ⭐️ Integrated your new page
      case "GradeEntry": return <GradeEntry />; // ⭐️ Integrated your new page
      case "SubjectGradeDeleteEntry": return <SubjectGradeDeleteEntry />; // ⭐️ Integrated your new page
      case "TermResult": return <TermResult />; // ⭐️ Integrated your new page
      case "YearlyResult": return <YearlyResult />; // ⭐️ Integrated your new page
      case "GradesAuditPage": return <GradesAuditPage />; // ⭐️ Integrated your new page
      case "ReportCard": return <ReportCard />; // ⭐️ Integrated your new page
      default:
        return (
          <div className="p-6 bg-white rounded-xl shadow-md">
            <h2 className="text-2xl font-bold text-gray-700 uppercase">{activeTab}</h2>
            <p className="mt-2 text-gray-500">Module under development for {assignedClass}.</p>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-40 w-64 bg-white p-4 border-r shadow-lg transform transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 md:static`}>
        <div className="flex flex-col items-center mb-6 text-center">
          {schoolLogoUrl && <img src={schoolLogoUrl} alt="Logo" className="w-14 h-14 object-contain mb-2" />}
          <h1 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-tight">{schoolName}</h1>
        </div>

        <div className="flex flex-col gap-2 mb-6 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
              {initials}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-indigo-900 truncate">{teacherName}</p>
              <p className="text-[10px] text-indigo-500 font-medium uppercase tracking-tighter">Subject Teacher</p>
            </div>
          </div>
          {isFormTeacher && (
            <div className="mt-2 flex items-center gap-1.5 px-2 py-1 bg-green-100 text-green-700 rounded-md border border-green-200">
              <MdVerifiedUser className="shrink-0" size={14}/>
              <span className="text-[11px] font-bold truncate">Form Teacher • {assignedClass}</span>
            </div>
          )}
        </div>

        <div className="space-y-1 overflow-y-auto max-h-[calc(100vh-320px)]">
          {renderNavItems(filteredNavItems)}
        </div>

        <div className="mt-auto pt-4 border-t">
          <Button variant="ghost" onClick={handleLogout} className="w-full text-red-600 hover:bg-red-50">
            <MdLogout className="mr-2" /> Logout
          </Button>
        </div>
      </div>

      {sidebarOpen && <div className="fixed inset-0 bg-black bg-opacity-40 z-30 md:hidden" onClick={() => setSidebarOpen(false)}></div>}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
          <button className="md:hidden p-2 text-indigo-600" onClick={() => setSidebarOpen(true)}>
            <MdDashboard size={24} />
          </button>
          <div className="hidden md:block text-xs font-semibold text-gray-400 uppercase tracking-widest">
            {isFormTeacher ? `Academic Management • ${assignedClass}` : "Academic Management"}
          </div>
          <div className="text-sm font-medium text-gray-500">
            {formattedDate}
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
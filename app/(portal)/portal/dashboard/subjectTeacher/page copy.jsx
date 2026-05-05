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
} from "react-icons/md";

import { useAuth } from "@/app/context/AuthContext";
import { useRouter } from "next/navigation";
import TeacherGradesPage from "../../TeacherAssign/TeacherGradesPage";
import StaffSelfAttendanceReport from "../../TeacherAssign/StaffSelfAttendanceReport";
import TeacherQuestionsPageObjectives from "../../TeacherAssign/TeacherQuestionsPageObjectives";
import TeacherQuestionsPageTheory from "../../TeacherAssign/TeacherQuestionsPageTheory";
import TeacherTimetableReport from "../../TeacherAssign/TeacherTimetableReport";
import TeacherGradesDashboard from "../../TeacherAssign/TeacherGradesDashboard";

// Updated NAV_ITEMS for a Teacher context
const NAV_ITEMS = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: <MdDashboard />,
  },
  {
    key: "grades",
    label: "Upload Grades",
    icon: <MdAttachMoney />,
  },
  {
    key: "gradesDashboard",
    label: "GradesDashboard",
    icon: <MdAttachMoney />,
  },
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
  {
    key: "Timetable",
    label: "Class Timetable",
    icon: <MdMenuBook />,
  },
  {
    key: "attendance",
    label: "Mark Attendance",
    icon: <MdPeople />,
  },
];

// BUTTON COMPONENT
const Button = ({ variant = "default", onClick, className = "", children }) => {
  let baseStyles =
    "inline-flex items-center justify-start whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-950 disabled:pointer-events-none disabled:opacity-50";

  let variantStyles =
    variant === "default"
      ? "bg-indigo-600 text-white shadow hover:bg-indigo-700"
      : "hover:bg-indigo-100 hover:text-indigo-700 text-gray-700";

  return (
    <button
      onClick={onClick}
      className={`${baseStyles} ${variantStyles} ${className} h-9 px-4 py-2 justify-start`}
    >
      {children}
    </button>
  );
};

export default function SubjectTeacherDashboard() {
  const { user, setUser, loading: authLoading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState("dashboard");
  const [openDropdown, setOpenDropdown] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 🛡️ AUTH CHECK: Redirect if not a teacher
  useEffect(() => {
    if (!authLoading) {
      if (!user || user.role !== "teacher") {
        router.replace("/login");
      }
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <p className="text-xl font-semibold text-indigo-700">
          {authLoading ? "Verifying Teacher Session..." : "Unauthorized Access"}
        </p>
      </div>
    );
  }

  // Destructuring based on your Login Page structure
  const { data: teacherData, schoolName, schoolLogoUrl } = user;
  
  // Mapping teacher specific fields from Firestore
  const teacherName = teacherData.teacherName || "Teacher";
  const teacherClass = teacherData.class || "Not Assigned";
  const initials = teacherName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

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
              onClick={() => {
                setOpenDropdown(openDropdown === item.key ? null : item.key);
              }}
              className="w-full flex items-center justify-between gap-2 text-base py-2"
            >
              <div className="flex items-center gap-2">
                {item.icon} {item.label}
              </div>
              <MdKeyboardArrowDown
                className={`transition-transform ${
                  openDropdown === item.key ? "rotate-180" : ""
                }`}
              />
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
            onClick={() => {
              setActiveTab(item.key);
              setOpenDropdown(null);
            }}
            className="w-full flex items-center gap-2 text-base py-2"
          >
            {item.icon} {item.label}
          </Button>
        )}
      </div>
    ));

 const renderContent = () => {
  // The 'switch' checks the value of activeTab (e.g., "dashboard", "grades")
  // and returns the matching component.
  switch (activeTab) {
    
    case "dashboard":
      // This will show the Attendance component when the dashboard tab is clicked
      return <StaffSelfAttendanceReport />; 
    

    case "grades":
      return <TeacherGradesPage/>;
      // return <div className="p-6">Grades / Attendance View</div>;
    case "gradesDashboard":
      return <TeacherGradesDashboard/>;
      // return <div className="p-6">Grades / Attendance View</div>;

    case "objectives":
        return < TeacherQuestionsPageObjectives/>
    case "theory":
      return < TeacherQuestionsPageTheory/>
    case "assignment":
      // These three cases handle the sub-menu items under "Teacher Questions"
      // return <TeacherQuestionsPage type={activeTab} />;
      return <div className="p-6">Question Bank: {activeTab.toUpperCase()}</div>;

    case "Timetable":
      return <TeacherTimetableReport />;
   

    default:
      // If no tab matches (fallback), show this "Under Development" message
      return (
        <div className="p-6 bg-white rounded-xl shadow-md">
          <h2 className="text-2xl font-bold text-gray-700">
            {activeTab.toUpperCase()}
          </h2>
          <p className="mt-2 text-gray-500">This module is currently being built.</p>
        </div>
      );
  }
};

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* SIDEBAR */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white p-4 border-r shadow-lg transform transition-transform duration-300
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 md:static`}
      >
        {/* School Logo/Info */}
        <div className="flex flex-col items-center mb-6 text-center">
          {schoolLogoUrl && (
            <img src={schoolLogoUrl} alt="Logo" className="w-16 h-16 object-contain mb-2" />
          )}
          <h1 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{schoolName}</h1>
        </div>

        {/* Teacher Info */}
        <div className="flex items-center gap-3 mb-6 p-2 bg-indigo-50 rounded-lg border border-indigo-100">
          <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
            {initials}
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-indigo-900 truncate">{teacherName}</p>
            <p className="text-xs text-indigo-600 truncate">{teacherClass}</p>
          </div>
        </div>

        <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-250px)]">
          {renderNavItems(NAV_ITEMS)}
        </div>

        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full justify-start flex items-center gap-2 text-base py-2 mt-auto text-red-600 hover:bg-red-50"
        >
          <MdLogout /> Logout
        </Button>
      </div>

      {/* MOBILE OVERLAY */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b p-4 flex items-center justify-between md:justify-end">
          <button
            className="md:hidden p-2 text-indigo-600"
            onClick={() => setSidebarOpen(true)}
          >
            <MdDashboard size={24} />
          </button>
          <div className="text-sm font-medium text-gray-500">
            {new Date().toLocaleDateString('en-GB', { dateStyle: 'full' })}
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
// app/components/MainNavbar.js

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image"; 
export default function MainNavbar() {
  const [open, setOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false); 

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <nav className="w-full bg-white shadow-md fixed top-0 left-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">

        {/* School Name and Logo (Brand Link) */}
        <Link href="/" className="flex items-center space-x-3">
          
          {/* 🛑 SCHOOL LOGO - Warning Fixed with sizes prop 🛑 */}
          <div className="relative w-8 h-8 md:w-10 md:h-10">
             <Image
                src="/images/hammond.jpg" 
                alt="Grace International School Logo"
                fill
                className="object-contain"
                priority
                // 🛑 FIX: Added the sizes prop
                sizes="(max-width: 768px) 32px, 40px" 
             />
          </div>

          {/* 🛑 SCHOOL NAME 🛑 */}
          <span className="text-xl md:text-2xl font-bold text-blue-700 hidden sm:block">
            Hammond Int'l Pre & Academy
          </span>
        </Link>

        {/* Desktop Menu & Login Button Wrapper */}
        <div className="hidden md:flex items-center space-x-8 text-lg"> 
          {/* Desktop Navigation Links */}
          <Link href="/" className="hover:text-blue-600">Home</Link>
          <Link href="/about" className="hover:text-blue-600">About</Link>
          <Link href="/service" className="hover:text-blue-600">Services</Link>
          <Link href="/gallery" className="hover:text-blue-600">Gallery</Link>
          <Link href="/contact" className="hover:text-blue-600">Contact</Link>
      

          {/* LOGIN BUTTON (Desktop) */}
          <Link 
            href="/login" 
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 transition duration-150"
          >
            Login to Portal
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden text-3xl focus:outline-none"
        >
          ☰
        </button>
      </div>

      {/* Mobile Dropdown - Uses isMounted for hydration stability */}
      {isMounted && open && (
        <div className="md:hidden bg-white shadow-lg px-6 pb-4 space-y-3 text-lg">
          {/* Mobile Links */}
          <Link href="/" className="block" onClick={() => setOpen(false)}>Home</Link>
          <Link href="/about" className="block" onClick={() => setOpen(false)}>About</Link>
          <Link href="/service" className="block" onClick={() => setOpen(false)}>Services</Link>
          <Link href="/gallery" className="block" onClick={() => setOpen(false)}>Gallery</Link>
          <Link href="/contact" className="block" onClick={() => setOpen(false)}>Contact</Link>
          
          {/* LOGIN BUTTON (Mobile) */}
          <Link 
            href="/login" 
            className="block w-full text-center px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 transition duration-150 mt-4"
            onClick={() => setOpen(false)}
          >
            Login to Portal
          </Link>
        </div>
      )}
    </nav>
  );
}
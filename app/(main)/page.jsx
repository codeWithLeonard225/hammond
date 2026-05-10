// app/(main)/page.js

import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Hammond International Preparatory & Academy | Shaping Global Leaders",
  description:
    "A premier preparatory institution in Sierra Leone dedicated to academic distinction, leadership, and innovative learning.",
};

export default function HomePage() {
  return (
    <div className="homepage-content font-sans antialiased text-slate-900">

      {/* 1. PREMIUM HERO SECTION (Split Design) */}
      <section className="relative min-h-[90vh] flex flex-col lg:flex-row">
        <div className="w-full lg:w-1/2 bg-[#0a192f] flex items-center justify-center p-8 lg:p-16">
          <div className="z-10 max-w-xl">
            <span className="text-amber-400 font-bold tracking-widest uppercase text-sm inline-block mb-4 border-b-2 border-amber-400">
              Est. 2026 | Freetown
            </span>
            <h1 className="text-4xl md:text-6xl font-serif font-bold text-white mb-6 leading-tight">
              Shaping the <span className="text-amber-400">Vanguard</span> of Tomorrow.
            </h1>
            <p className="text-slate-300 text-lg md:text-xl mb-10 leading-relaxed">
              Hammond International Preparatory & Academy combines traditional values with 
              modern innovation to provide an elite educational experience.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/admissions"
                className="bg-amber-500 hover:bg-amber-600 text-[#0a192f] text-lg font-bold px-10 py-4 rounded-md transition-all transform hover:-translate-y-1 shadow-lg"
              >
                Join the Academy
              </Link>
              <Link
                href="/about"
                className="border border-white/30 hover:bg-white/10 text-white text-lg font-semibold px-10 py-4 rounded-md transition-all"
              >
                Our Heritage
              </Link>
            </div>
          </div>
        </div>
        
        <div className="w-full lg:w-1/2 relative h-[400px] lg:h-auto">
          <Image
            src="/images/hipsaBackground.jpeg"
            alt="HIPA Students in Modern Learning Environment"
            fill
            priority
            className="object-cover"
            sizes="50vw"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a192f] to-transparent lg:block hidden"></div>
        </div>
      </section>

      {/* 2. THE HAMMOND EDGE (Modern Feature Grid) */}
      <section className="py-24 bg-white px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
            <div className="max-w-2xl">
              <h2 className="text-4xl font-serif font-bold text-[#0a192f] mb-4">
                The Hammond Edge
              </h2>
              <p className="text-slate-500 text-lg">
                We don't just teach; we prepare. Our methodology focuses on the 
                intersection of character, intellect, and technology.
              </p>
            </div>
            <Link href="/curriculum" className="text-amber-600 font-bold hover:underline">
              Explore our Curriculum &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              {
                title: "Global Citizenship",
                desc: "An internationally recognized curriculum that fosters a borderless mindset.",
                icon: "🌍"
              },
              {
                title: "Digital Fluency",
                desc: "Every student graduates with proficiency in the digital tools of the 21st century.",
                icon: "💻"
              },
              {
                title: "Ethical Leadership",
                desc: "A core focus on integrity and community responsibility in every lesson.",
                icon: "🛡️"
              }
            ].map((pillar, index) => (
              <div key={index} className="group p-8 border-t-4 border-slate-100 hover:border-amber-500 bg-slate-50 transition-all duration-500">
                <span className="text-4xl mb-6 block">{pillar.icon}</span>
                <h3 className="text-xl font-bold text-[#0a192f] mb-4 group-hover:text-amber-600 transition-colors">
                  {pillar.title}
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  {pillar.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. EXECUTIVE PROPRIETOR MESSAGE (Clean & Authoritative) */}
      <section className="bg-slate-50 py-24 px-6 overflow-hidden">
        <div className="max-w-6xl mx-auto relative">
          <div className="absolute -left-10 top-0 text-[200px] text-slate-200 font-serif leading-none opacity-50 select-none">“</div>
          
          <div className="flex flex-col lg:flex-row items-center gap-16 relative z-10">
            <div className="w-full lg:w-1/2">
              <h4 className="text-amber-600 font-bold tracking-widest uppercase text-xs mb-4">Director's Welcome</h4>
              <h2 className="text-4xl font-serif font-bold text-[#0a192f] mb-8 leading-tight">
                A Vision for <br />Competitive Excellence.
              </h2>
              
              <div className="space-y-6 text-slate-600 text-lg leading-relaxed">
                <p>
                  Welcome to <strong>Hammond International Preparatory School & Academy (HIPSA)</strong>. 
                  Our institution stands as a testament to the belief that every child possesses 
                  the capacity for greatness when provided with the right environment.
                </p>
                <p>
                  HIPA isn't just a school; it is a community of thinkers and doers. 
                  Our mission is to bridge the gap between classroom theory and global reality.
                </p>
              </div>

              <div className="mt-12 flex items-center gap-4">
                <div className="h-16 w-1 bg-amber-500"></div>
                <div>
                  <p className="text-xl font-bold text-[#0a192f] uppercase tracking-tighter">[Proprietor Name]</p>
                  <p className="text-slate-500 font-medium">Founder & Executive Director, HIPA</p>
                </div>
              </div>
            </div>

            <div className="w-full lg:w-1/2 flex justify-center">
              <div className="relative group">
                <div className="absolute inset-0 bg-amber-500 rounded-lg rotate-3 group-hover:rotate-0 transition-transform duration-500"></div>
                <div className="relative w-[320px] h-[400px] md:w-[400px] md:h-[500px] rounded-lg overflow-hidden shadow-2xl">
                  <Image
                    src="/images/pro.jpeg" 
                    alt="Director of HIPA"
                    fill
                    className="object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. ACADEMY PORTAL (Action-Oriented) */}
      <section className="bg-[#0a192f] py-20 px-6">
        <div className="max-w-5xl mx-auto rounded-3xl bg-gradient-to-br from-amber-500 to-amber-600 p-8 md:p-16 flex flex-col md:flex-row items-center justify-between shadow-2xl">
          <div className="mb-8 md:mb-0 text-center md:text-left">
            <h2 className="text-3xl md:text-4xl font-bold text-[#0a192f] mb-4">
              Access the HIPSA Portal
            </h2>
            <p className="text-[#0a192f]/80 text-lg font-medium">
              Monitor academic progress and stay connected in real-time.
            </p>
          </div>
          <Link
            href="/login"
            className="bg-[#0a192f] text-white hover:bg-slate-800 text-lg font-bold px-10 py-4 rounded-xl transition shadow-xl whitespace-nowrap"
          >
            Student Login
          </Link>
        </div>
      </section>

    </div>
  );
}
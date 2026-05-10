// app/about/page.js

import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Our Heritage | Hammond International Preparatory & Academy",
  description: "Discover the vision, mission, and core values that drive excellence at HIPA.",
};

export default function AboutPage() {
  return (
    <div className="bg-white font-sans antialiased text-slate-900">

      {/* 1. MINIMALIST HERO SECTION */}
      <section className="relative h-[45vh] bg-[#0a192f] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <Image 
            src="/images/school-hero.jpg" 
            alt="Academy Architecture" 
            fill 
            className="object-cover"
          />
        </div>
        <div className="relative z-10 text-center px-6">
          <h1 className="text-4xl md:text-6xl font-serif font-bold text-white mb-4">
            Our Heritage & <span className="text-amber-400">Vision</span>
          </h1>
          <div className="w-24 h-1 bg-amber-500 mx-auto"></div>
        </div>
      </section>

      {/* 2. THE INSTITUTION (Editorial Layout) */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-20 items-center">
          <div className="relative">
            <div className="absolute -top-4 -left-4 w-full h-full border-2 border-amber-500/20 rounded-2xl"></div>
            <div className="relative rounded-2xl overflow-hidden shadow-2xl">
               <Image 
                src="/images/classroom.jpg" 
                alt="Modern Learning at HIPA" 
                width={600} 
                height={800} 
                className="w-full h-auto object-cover"
              />
            </div>
            <div className="absolute -bottom-8 -right-8 bg-amber-500 text-[#0a192f] p-8 rounded-xl hidden md:block shadow-xl">
              <p className="font-serif italic text-xl">"Commitment to Excellence"</p>
            </div>
          </div>

          <div className="space-y-8">
            <h4 className="text-amber-600 font-bold tracking-[0.2em] uppercase text-sm">The Institution</h4>
            <h2 className="text-4xl font-serif font-bold text-[#0a192f] leading-tight">
              A Legacy of Intellectual <br/>Rigour and Character.
            </h2>
            <div className="space-y-6 text-slate-600 text-lg leading-relaxed">
              <p>
                <strong>Hammond International Preparatory School & Academy (HIPSA)</strong> is more than an 
                educational center; it is a catalyst for transformation in Sierra Leone. 
                We operate on the principle that academic mastery must be coupled with 
                unwavering integrity.
              </p>
              <p>
                Our pedagogy blends traditional discipline with 21st-century digital fluency, 
                ensuring our students are not just prepared for exams, but for the 
                complexities of global leadership.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. PHILOSOPHY & OBJECTIVES (Side-by-Side Cards) */}
      <section className="py-24 bg-slate-50 border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-8">
          <div className="bg-white p-12 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-6 text-amber-600 text-2xl">👁️</div>
            <h3 className="text-2xl font-serif font-bold text-[#0a192f] mb-4">Our Vision</h3>
            <p className="text-slate-600 leading-relaxed italic">
              "To foster an elite atmosphere where every stakeholder—students, parents, and faculty—is 
              assured of their value as an integral pillar of our global community."
            </p>
          </div>

          <div className="bg-[#0a192f] p-12 rounded-3xl shadow-xl text-white">
            <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mb-6 text-amber-400 text-2xl">🎯</div>
            <h3 className="text-2xl font-serif font-bold mb-4">Our Mission</h3>
            <p className="text-slate-300 leading-relaxed">
              Our mission is to empower pupils to acquire and apply knowledge through personal 
              attribute and academic grounding. We strive to produce morally upright leaders 
              who are adequately equipped for the digital age.
            </p>
          </div>
        </div>
      </section>

      {/* 4. THE TRIAD OF VALUES */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-20">
            <h2 className="text-4xl font-serif font-bold text-[#0a192f] mb-4">The HIPSA Triad</h2>
            <p className="text-slate-500">The three foundational values that govern every interaction within our halls.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-slate-100 shadow-2xl rounded-3xl overflow-hidden">
            {[
              { title: "Discipline", desc: "Instilling deep moral values, respect, and the self-control required for leadership.", color: "bg-white" },
              { title: "Excellence", desc: "Maintaining uncompromising academic standards and a culture of continuous improvement.", color: "bg-amber-500" },
              { title: "Innovation", desc: "Pioneering the use of digital tools to enhance cognitive development and research.", color: "bg-[#0a192f]" }
            ].map((value, idx) => (
              <div key={idx} className={`p-12 ${value.color} ${idx === 2 || idx === 1 ? 'text-white' : 'text-[#0a192f]'}`}>
                <span className="text-xs font-black uppercase tracking-widest opacity-60 mb-6 block">Value 0{idx + 1}</span>
                <h3 className={`text-3xl font-serif font-bold mb-4 ${idx === 1 ? 'text-[#0a192f]' : ''}`}>{value.title}</h3>
                <p className={`${idx === 0 ? 'text-slate-500' : 'text-slate-200'} leading-relaxed`}>
                  {value.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. THE HAMMOND ADVANTAGE (Checklist) */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-serif font-bold text-[#0a192f] mb-12 text-center underline decoration-amber-500 underline-offset-8">
            Why the Academy?
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              "Highly qualified faculty with international training",
              "Secure, high-tech campus environment",
              "Blended learning architecture",
              "Focus on character and moral discipline",
              "Competitive and value-driven fee structure",
              "Real-time parent-teacher portal access",
              "Sanitized, ergonomic classroom designs"
            ].map((item, idx) => (
              <div key={idx} className="flex items-center space-x-3 bg-white p-4 rounded-xl border border-slate-200">
                <span className="text-amber-500 font-bold text-xl">✓</span>
                <span className="text-slate-700 font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. CALL TO ACTION */}
      <section className="bg-[#0a192f] py-20 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-serif font-bold text-white mb-8">
            Admissions Now Open.
          </h2>
          <p className="text-slate-300 text-lg mb-10 leading-relaxed">
            Take the first step toward a global future. Contact our admissions 
            office for a campus tour or registration details.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              href="/contact"
              className="bg-amber-500 hover:bg-amber-600 text-[#0a192f] px-12 py-4 text-lg font-bold rounded-lg transition-all"
            >
              Consult with Admissions
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
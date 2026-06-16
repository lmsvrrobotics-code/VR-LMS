import { useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowRight,
  Sparkles,
  Code2,
  Gamepad2,
  Bot,
  Cpu,
  Brain,
  Wifi,
  Lightbulb,
  Wrench,
  Bug,
  Presentation,
  PartyPopper,
  ClipboardList,
  CalendarCheck,
  MessageSquare,
  ListChecks,
  KeyRound,
  Award,
  Users,
  GraduationCap,
  ShieldCheck,
  Quote,
  Image as ImageIcon,
  Images,
  Calendar,
  PlayCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Search,
} from "lucide-react";

const ADMIN_BASE =
  (import.meta.env.VITE_ADMIN_API_URL as string) || "http://localhost:5000";

interface GalleryItem {
  id: number;
  title: string;
  description: string | null;
  media_type: "image" | "video";
  media_url: string | null;
  event_date: string | null;
}

const formatGalleryDate = (raw: string | null) => {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  // "AUG 18, 2024" — uppercase month, matching the card style.
  return d
    .toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    .toUpperCase();
};

interface ProjectItem {
  id: number;
  title: string;
  description: string | null;
  author_name: string | null;
  project_date: string | null;
  image_url: string | null;
  link_url: string | null;
}

interface TestimonialItem {
  id: number;
  message: string;
  author_name: string;
  role: string | null;
  avatar_url: string | null;
}

interface CourseItem {
  id: number;
  title: string;
  slug: string;
  short_description: string;
  thumbnail: string;
  level: string;
  lesson_count: number;
  total_duration_secs: number;
}

/**
 * VR Robotics Academy landing page — recreated in React/Tailwind from the
 * VR Robotics static export (index.vrrobotics-backup.html). Replaces the
 * previous Roboprenr content. Self-contained: copy, team, curriculum, process,
 * certificates, projects and partners all come from that backup.
 */

const ROBOT_IMG =
  "https://res.cloudinary.com/dqcybkje5/image/upload/v1781092137/ChatGPT_Image_Jun_10_2026_05_16_21_PM_1_t9q9hc.png";

const modules = [
  { name: "Digital Logic Foundations", desc: "Build your first programs and understand core computational thinking", img: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&h=300&fit=crop" },
  { name: "Creative Code Lab", desc: "Design interactive animations and games using visual programming", img: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&h=300&fit=crop" },
  { name: "3D Innovation Studio", desc: "Transform ideas into 3D models and prototypes for real-world solutions", img: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=600&h=300&fit=crop" },
  { name: "Smart Electronics Workshop", desc: "Master circuits, sensors, and microcontroller programming", img: "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=600&h=300&fit=crop" },
  { name: "Robot Builder Academy", desc: "Assemble and program intelligent robots from scratch", img: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600&h=300&fit=crop" },
  { name: "Advanced Robotics Engineering", desc: "Design autonomous systems with complex sensors and actuators", img: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=300&fit=crop" },
  { name: "Python Power Skills", desc: "Master professional coding with industry-standard Python language", img: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&h=300&fit=crop" },
  { name: "Automation & AI Lab", desc: "Create intelligent scripts and automated solutions using Python", img: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600&h=300&fit=crop" },
  { name: "Mobile Innovation Studio", desc: "Build professional mobile applications for Android and iOS", img: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=600&h=300&fit=crop" },
  { name: "Connected Robotics Systems", desc: "Develop apps that control robots through wireless connectivity", img: "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=600&h=300&fit=crop" },
  { name: "AI & Machine Learning Basics", desc: "Train intelligent systems and understand artificial intelligence concepts", img: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=600&h=300&fit=crop" },
  { name: "Computer Vision Projects", desc: "Enable robots to see and interpret the world through cameras", img: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=600&h=300&fit=crop" },
  { name: "IoT & Smart Technology", desc: "Connect devices to the internet and build smart home systems", img: "https://images.unsplash.com/photo-1558346490-a72e53ae2d4f?w=600&h=300&fit=crop" },
  { name: "Interactive Game Development", desc: "Create immersive games with professional tools and frameworks", img: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&h=300&fit=crop" },
  { name: "Web Builder Fundamentals", desc: "Design and code modern, interactive websites from scratch", img: "https://images.unsplash.com/photo-1547658719-da2b51169166?w=600&h=300&fit=crop" },
  { name: "Electronics & Circuit Design", desc: "Master electronic components and advanced circuit engineering", img: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=600&h=300&fit=crop" },
  { name: "Innovation Challenge", desc: "Compete in robotics challenges and showcase your skills", img: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=600&h=300&fit=crop" },
  { name: "Final Grand Project", desc: "Apply all your knowledge in a comprehensive capstone project", img: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&h=300&fit=crop" },
];

const buildSteps = [
  { title: "Ideation & Planning", icon: Lightbulb, desc: "Students brainstorm ideas, sketch designs, and plan their project. Mentors guide them through the design thinking process." },
  { title: "Building & Assembly", icon: Wrench, desc: "Time to bring ideas to life! Students assemble robots, connect components, and build physical prototypes with hands-on guidance." },
  { title: "Programming", icon: Code2, desc: "Students write code to control their creations. They learn to program sensors, motors, and create interactive behaviors." },
  { title: "Testing & Debugging", icon: Bug, desc: "Projects are tested, refined, and improved. Students learn that failure is part of the learning process and iterate to perfection." },
  { title: "Presentation", icon: Presentation, desc: "Students showcase their projects to peers and mentors, explaining their design choices and demonstrating functionality." },
  { title: "Celebration & Reflection", icon: PartyPopper, desc: "Celebrate achievements and reflect on learnings. Students receive feedback and plan their next innovative project!" },
];

const admissionSteps = [
  { title: "Online Application", icon: ClipboardList, desc: "Fill out our quick online form with basic information about your child — their interests, age, and goals. It takes just 5 minutes!" },
  { title: "Demo Session", icon: CalendarCheck, desc: "Schedule a 30-minute demo where your child can experience our VR robotics platform, meet our teachers, and ask questions." },
  { title: "Assessment & Feedback", icon: MessageSquare, desc: "After the demo, we provide personalized feedback and recommend the best learning path for your child based on their skill level." },
  { title: "Choose Your Program", icon: ListChecks, desc: "Select from our flexible plans — beginner, intermediate, or advanced. Start immediately in the next batch or your preferred schedule." },
  { title: "Get Started", icon: KeyRound, desc: "Get access to our platform, teachers, learning materials, and community. Your child begins their journey to becoming a tech innovator!" },
];

const certificates = [
  { tier: "Foundation", desc: "Foundation-level completion certificate for core robotics concepts, sensors, and basic automation." },
  { tier: "Basic", desc: "Basic program completion certificate focused on robotics fundamentals, creativity, and practical learning." },
  { tier: "Standard", desc: "Standard program completion certificate covering structured robotics learning and real project execution." },
  { tier: "Advanced", desc: "Advanced program completion certificate for higher-level robotics thinking, execution, and innovation." },
];

const whyChoose = [
  { title: "Expert Engineering Trainers", icon: GraduationCap, desc: "Every session is led by degree-qualified, background-verified engineers certified in our curriculum delivery methodology." },
  { title: "Project-Based Learning", icon: Wrench, desc: "100% hands-on — students build real robots and ship real projects rather than just watching lectures." },
  { title: "Recognized Certificates", icon: Award, desc: "Earn Foundation to Advanced completion certificates that document your child's growing expertise." },
  { title: "Future-Ready Curriculum", icon: Brain, desc: "An 18-module path spanning robotics, coding, AI, computer vision, and IoT — built for tomorrow's innovators." },
  { title: "Small, Personal Batches", icon: Users, desc: "Focused attention in small batches so every student gets mentor guidance at their own pace." },
  { title: "Trusted by Schools", icon: ShieldCheck, desc: "Partnered with reputed institutions to deliver world-class robotics, coding, and AI education on campus." },
];

// ── Book Demo flow — ported from index.vrrobotics-backup.html ──
// Uses THIS app's existing Supabase project (VITE_SUPABASE_URL) for the
// confirm-booking / create-order edge functions; paid mode uses Razorpay (₹49).
const DEMO_SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string) || "https://mpqtuhgeuixsydofolwo.supabase.co";
const DEMO_SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "";
// Razorpay key id for the ₹49 Book-Demo checkout. From env so dev/staging
// builds use a rzp_test_ key — the LIVE key was previously hardcoded here,
// which meant every local test charged real money. key_id is safe to expose
// to the browser (checkout needs it); only the secret must stay server-side.
// Unset → the paid flow shows an error instead of opening live checkout.
const RAZORPAY_KEY_ID = (import.meta.env.VITE_RAZORPAY_KEY_ID as string) || "";
const DEMO_PRICE_PAISE = 4900;
const GRADES = Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`);

const callEdge = async (fn: string, body: Record<string, unknown>) => {
  const res = await fetch(`${DEMO_SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEMO_SUPABASE_ANON_KEY}` },
    body: JSON.stringify(body),
  });
  return res.json();
};

const loadRazorpay = () =>
  new Promise<boolean>((resolve) => {
    const w = window as unknown as { Razorpay?: unknown };
    if (w.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

type RzpHandlerResp = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
interface RzpInstance { open: () => void; on: (e: string, cb: () => void) => void }
interface RzpOptions {
  key: string; amount: number; currency: string; name: string; description: string; order_id: string;
  prefill: { name: string; email: string; contact: string }; theme: { color: string };
  handler: (r: RzpHandlerResp) => void; modal: { ondismiss: () => void };
}

const BookDemoModal = ({ onClose, mode = "paid" }: { onClose: () => void; mode?: "free" | "paid" }) => {
  const [form, setForm] = useState({ parent_name: "", student_name: "", grade: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((s) => ({ ...s, [k]: v }));

  const phoneE164 = () => {
    let p = form.phone.replace(/\s/g, "");
    if (p.length === 10 && !p.startsWith("+")) p = "+91" + p;
    else if (!p.startsWith("+") && p.length > 10) p = "+" + p;
    return p;
  };

  const submitBtnText = mode === "free" ? "Book My Free Demo Session →" : "Pay ₹49 & Book Demo →";

  const submitFree = async (data: Record<string, unknown>) => {
    setSubmitting(true); setError(null);
    try {
      const r = await callEdge("confirm-booking", { ...data, demo_type: "free", payment_status: "free", skip_sms: true });
      if (r?.success) setSuccess(true);
      else { setError("Booking failed: " + (r?.error || "Please try again")); setSubmitting(false); }
    } catch { setError("Network error. Please try again."); setSubmitting(false); }
  };

  const submitPaid = async (data: Record<string, unknown>) => {
    setSubmitting(true); setError(null);
    try {
      const save = await callEdge("confirm-booking", { ...data, demo_type: "paid", payment_status: "to be follow up", skip_sms: true });
      if (!save?.success || !save?.booking_id) { setError("Failed to save booking: " + (save?.error || "Please try again")); setSubmitting(false); return; }
      const order = await callEdge("create-order", { amount: DEMO_PRICE_PAISE });
      if (!order?.success || !order?.order_id) { setError("Failed to create payment order: " + (order?.error || "Please try again")); setSubmitting(false); return; }
      const ok = await loadRazorpay();
      const w = window as unknown as { Razorpay?: new (o: RzpOptions) => RzpInstance };
      if (!ok || !w.Razorpay) { setError("Could not load payment. Please try again."); setSubmitting(false); return; }
      if (!RAZORPAY_KEY_ID) { setError("Payments are not configured on this build. Please contact us to book."); setSubmitting(false); return; }
      const rzp = new w.Razorpay({
        key: RAZORPAY_KEY_ID, amount: DEMO_PRICE_PAISE, currency: "INR",
        name: "VR Robotics Academy", description: "Demo Session Booking — ₹49", order_id: order.order_id as string,
        prefill: { name: String(data.parent_name), email: String(data.email), contact: String(data.phone) },
        theme: { color: "#FF6A00" },
        handler: async (resp: RzpHandlerResp) => {
          await fetch(`${DEMO_SUPABASE_URL}/rest/v1/demo_bookings?id=eq.${save.booking_id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEMO_SUPABASE_ANON_KEY}`, apikey: DEMO_SUPABASE_ANON_KEY, Prefer: "return=minimal" },
            body: JSON.stringify({ payment_status: "success", razorpay_payment_id: resp.razorpay_payment_id, razorpay_order_id: resp.razorpay_order_id, razorpay_signature: resp.razorpay_signature }),
          }).catch(() => {});
          setSuccess(true); setSubmitting(false);
        },
        modal: { ondismiss: () => setSubmitting(false) },
      });
      rzp.on("payment.failed", () => { setError("Payment failed. Please try again."); setSubmitting(false); });
      rzp.open();
    } catch { setError("Network error. Please try again."); setSubmitting(false); }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.parent_name || !form.student_name || !form.grade || !form.email) { setError("Please fill in all required fields."); return; }
    const data = { parent_name: form.parent_name.trim(), student_name: form.student_name.trim(), grade: form.grade, email: form.email.trim(), phone: phoneE164() };
    if (mode === "free") submitFree(data); else submitPaid(data);
  };

  const inputCls = "w-full rounded-lg border px-4 py-2.5 outline-none focus:border-primary text-sm";

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg p-7" onClick={(e) => e.stopPropagation()}>
        {success ? (
          <div className="text-center py-4">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-xl font-bold mb-2">{mode === "free" ? "You have successfully booked the free demo!" : "Payment successful! Your demo is booked!"}</h3>
            <p className="text-sm text-muted-foreground mb-1">A confirmation message has been sent to your email.</p>
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 my-4 text-sm">
              <div className="text-primary font-bold mb-1">🎉 Session Confirmed!</div>
              <div className="text-muted-foreground">Our team will contact you within 24 hours to confirm the schedule.</div>
            </div>
            <Button onClick={onClose} className="bg-gradient-hero border-0">Done</Button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  Book Demo
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${mode === "free" ? "bg-green-100 text-green-700" : "bg-primary/15 text-primary"}`}>{mode === "free" ? "FREE" : "₹49"}</span>
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">{mode === "free" ? "Fill the form and we'll confirm your free session." : "Fill the form & pay ₹49 to confirm your session."}</p>
              </div>
              <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">✕</button>
            </div>
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <input required value={form.parent_name} onChange={(e) => set("parent_name", e.target.value)} placeholder="Parent/Guardian Name *" className={inputCls} />
                <input required value={form.student_name} onChange={(e) => set("student_name", e.target.value)} placeholder="Student Name *" className={inputCls} />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <select required value={form.grade} onChange={(e) => set("grade", e.target.value)} className={inputCls + " bg-white"}>
                  <option value="">Select Grade *</option>
                  {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <input required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="Email Address *" className={inputCls} />
              </div>
              <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Phone Number (+91 9XXXXXXXXX)" className={inputCls} />
              <Button type="submit" disabled={submitting} className="w-full bg-gradient-hero border-0">{submitting ? "Booking…" : submitBtnText}</Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

const Home = () => {
  const [demoOpen, setDemoOpen] = useState(false);
  const navigate = useNavigate();
  // Hero course search → sends the kid to the catalog with the term applied.
  const [heroSearch, setHeroSearch] = useState("");
  const runHeroSearch = () => {
    const v = heroSearch.trim();
    navigate(v ? `/courses/browse?search=${encodeURIComponent(v)}` : "/courses/browse");
  };

  // Live gallery preview — same source as the /gallery page (admin-service).
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  // Admin-managed Student Projects + Testimonials (reflected here when added).
  const [projectItems, setProjectItems] = useState<ProjectItem[]>([]);
  const [testimonials, setTestimonials] = useState<TestimonialItem[]>([]);
  // Admin-published courses (short preview shown below the Curriculum section).
  const [courses, setCourses] = useState<CourseItem[]>([]);
  useEffect(() => {
    let cancelled = false;
    const cacheBust = { params: { t: Date.now() }, headers: { "Cache-Control": "no-cache" }, timeout: 30000 };
    (async () => {
      try {
        const { data } = await axios.get(`${ADMIN_BASE}/api/public/gallery`, { timeout: 30000 });
        if (!cancelled) setGallery(Array.isArray(data) ? data.slice(0, 6) : []);
      } catch {
        if (!cancelled) setGallery([]);
      }
      try {
        const { data } = await axios.get(`${ADMIN_BASE}/api/public/projects`, cacheBust);
        if (!cancelled) setProjectItems(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setProjectItems([]);
      }
      try {
        const { data } = await axios.get(`${ADMIN_BASE}/api/public/testimonials`, cacheBust);
        if (!cancelled) setTestimonials(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setTestimonials([]);
      }
      try {
        // home=1 → only courses the admin explicitly published to the Home
        // page ("Show on Home" toggle on the course form). While no course is
        // published, this returns [] and the whole "Our Courses" section stays
        // hidden — courses under construction never leak to visitors.
        const { data } = await axios.get(`${ADMIN_BASE}/api/public/courses/catalog?home=1`, cacheBust);
        if (!cancelled) setCourses(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setCourses([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Testimonials rotator (center-focus) ───────────────────────────────
  // One active card is centered and emphasised; its neighbours peek in from
  // the edges, faded and slightly scaled down. The track is translated so the
  // active card sits at the horizontal centre: translateX(%) is relative to
  // the track (= container) width, so centring card i is
  //   50% − cardWidth × (i + 0.5).
  // tCardW is the active card's width as a % of the row, responsive so the
  // side peeks stay visible on smaller screens.
  const [tIndex, setTIndex] = useState(0);
  const [tCardW, setTCardW] = useState(44);
  useEffect(() => {
    const compute = () => {
      if (window.matchMedia("(min-width: 1024px)").matches) setTCardW(44);
      else if (window.matchMedia("(min-width: 640px)").matches) setTCardW(62);
      else setTCardW(84);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  const tMaxIndex = Math.max(0, testimonials.length - 1);
  useEffect(() => { setTIndex((i) => Math.min(i, tMaxIndex)); }, [tMaxIndex]);
  const tShowArrows = testimonials.length > 1;

  return (
    <div className="overflow-hidden">
      {/* ───────────── Hero ───────────── */}
      <section id="home" className="relative bg-gradient-subtle">
        <div className="container-ngo grid lg:grid-cols-2 gap-10 items-center lg:items-start py-16 lg:py-20">
          <div className="space-y-5 lg:pt-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-4 py-1.5 text-sm font-semibold">
              <Sparkles className="w-4 h-4" /> The Future of STEM Education
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.05]">
              Learn <span className="text-gradient">Robotics & AI</span> Faster —
              With Clear Guidance and Real Projects.
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl">
              Structured courses, expert support, and hands-on learning for
              students and beginners. Live in Future with VR Robotics Academy.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="bg-gradient-hero border-0 text-lg px-8" onClick={() => setDemoOpen(true)}>
                Book Demo <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8" asChild>
                <a href="#curriculum">Explore Curriculum</a>
              </Button>
            </div>

            {/* Kid-friendly course search → catalog */}
            <form
              onSubmit={(e) => { e.preventDefault(); runHeroSearch(); }}
              className="relative max-w-md"
            >
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                value={heroSearch}
                onChange={(e) => setHeroSearch(e.target.value)}
                placeholder="Search courses… try “robots”, “coding”, “AI”"
                aria-label="Search courses"
                className="w-full rounded-full border border-border bg-white pl-12 pr-24 py-3 text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                type="submit"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-gradient-hero text-white rounded-full px-5 py-2 text-sm font-semibold"
              >
                Search
              </button>
            </form>
          </div>

          <div className="flex justify-center items-center pt-12 lg:pt-16">
            {/* Wrapper shrinks to the image, so the ring + aura below are sized
                relative to the image and stay aligned/centered as it scales. */}
            <div className="relative inline-block w-full max-w-2xl lg:max-w-3xl">
              {/* Soft aura behind the image (gentle pulse) */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 aspect-square w-[88%] rounded-full bg-gradient-to-br from-primary/25 via-orange-200/30 to-transparent blur-3xl animate-glow-pulse" />

              {/* Dashed circle ring, sized to hug the image so its content meets
                  the ring line. Centered box so the spin rotates around the image. */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 aspect-square w-[98%] flex items-center justify-center">
                <div className="w-full h-full rounded-full border-2 border-dashed border-primary/30 animate-ring-spin" />
                {/* Accent dots ride along the ring's edge */}
                <span className="absolute top-0 left-1/2 w-3.5 h-3.5 rounded-full bg-primary/70 blur-[1px] animate-orb-drift" />
                <span className="absolute bottom-6 right-2 w-5 h-5 rounded-full bg-orange-400/60 blur-[1px] animate-orb-drift" style={{ animationDelay: "1.5s" }} />
                <span className="absolute top-1/2 right-0 w-3 h-3 rounded-full bg-amber-300/80 animate-orb-drift" style={{ animationDelay: "3s" }} />
                <span className="absolute bottom-2 left-10 w-2.5 h-2.5 rounded-full bg-primary/80 animate-orb-drift" style={{ animationDelay: "0.8s" }} />
              </div>

              {/* Hero illustration — gentle float, centered in the ring */}
              <img
                src={ROBOT_IMG}
                alt="Kids learning robotics, AI and STEM with VR Robotics Academy"
                className="relative z-10 w-full object-contain animate-robot-float"
                loading="eager"
              />
            </div>
          </div>
        </div>

      </section>

      {/* ───────────── What Kids Learn — 18-Module Learning Path ───────────── */}
      <section id="curriculum" className="section-padding bg-gradient-subtle">
        <div className="container-ngo">
          <div className="text-center space-y-3 mb-14">
            <p className="text-primary font-semibold">What Kids Learn</p>
            <h2 className="text-3xl md:text-4xl font-bold">
              A complete journey across <span className="text-gradient">robotics, coding & AI</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              A structured, step-by-step 18-module progression from your first
              circuit to a fully autonomous robot.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {modules.map((m, i) => (
              <div
                key={m.name}
                className="card-ngo-static border-0 rounded-2xl overflow-hidden flex flex-col group"
              >
                <div className="relative aspect-[2/1] overflow-hidden bg-muted">
                  <img
                    src={m.img}
                    alt={m.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                  <span className="absolute top-3 left-3 w-9 h-9 rounded-lg bg-gradient-hero text-white font-bold flex items-center justify-center shadow-md">
                    {i + 1}
                  </span>
                </div>
                <div className="p-5 flex flex-col flex-1">
                  <h3 className="font-semibold text-lg mb-1">{m.name}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed flex-1">{m.desc}</p>
                  <button
                    type="button"
                    onClick={() => setDemoOpen(true)}
                    className="mt-4 inline-flex items-center gap-1 text-primary font-semibold text-sm hover:gap-2 transition-all self-start"
                  >
                    Book Demo <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── Our Courses (admin-published preview) ───────────── */}
      {courses.length > 0 && (
        <section id="courses-preview" className="section-padding">
          <div className="container-ngo">
            <div className="text-center space-y-3 mb-14">
              <p className="text-primary font-semibold">Our Courses</p>
              <h2 className="text-3xl md:text-4xl font-bold">
                Explore our <span className="text-gradient">course catalog</span>
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                A quick look at the courses we offer — open any course for the full details.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {courses.map((c) => {
                const hours = Math.floor((c.total_duration_secs || 0) / 3600);
                return (
                  <Link
                    key={c.id}
                    to={`/courses/programs/course-details?slug=${encodeURIComponent(c.slug)}`}
                    className="card-ngo border-0 group overflow-hidden flex flex-col h-full rounded-2xl"
                  >
                    <div className="relative aspect-[16/9] overflow-hidden bg-muted">
                      {c.thumbnail ? (
                        <img
                          src={c.thumbnail}
                          alt={c.title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-hero">
                          <GraduationCap className="w-14 h-14 text-white/80" />
                        </div>
                      )}
                    </div>
                    <div className="p-6 flex flex-col flex-1">
                      <h3 className="font-bold text-xl mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                        {c.title}
                      </h3>
                      {c.short_description && (
                        <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2 mb-4">
                          {c.short_description}
                        </p>
                      )}
                      <div className="mt-auto flex items-center gap-6 pt-4 border-t border-border/60 text-sm font-medium">
                        <span className="inline-flex items-center gap-2">
                          <FileText className="w-4 h-4 text-primary" />
                          {c.lesson_count} {c.lesson_count === 1 ? "Lesson" : "Lessons"}
                        </span>
                        {hours > 0 && (
                          <span className="inline-flex items-center gap-2">
                            <Clock className="w-4 h-4 text-primary" />
                            {hours}+ Hours
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ───────────── How We Build ───────────── */}
      <section id="build" className="section-padding">
        <div className="container-ngo">
          <div className="text-center space-y-3 mb-14">
            <p className="text-primary font-semibold">How We Build</p>
            <h2 className="text-3xl md:text-4xl font-bold">Our project-based learning process</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {buildSteps.map((s, i) => (
              <Card key={s.title} className="card-ngo border-0">
                <CardContent className="p-6 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-lg bg-gradient-hero flex items-center justify-center">
                      <s.icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xs font-bold text-primary">STEP {i + 1}</span>
                  </div>
                  <h3 className="font-semibold text-lg">{s.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── Why Choose ───────────── */}
      <section id="why" className="section-padding bg-gradient-subtle">
        <div className="container-ngo">
          <div className="text-center space-y-3 mb-14">
            <p className="text-primary font-semibold">Why VR Robotics</p>
            <h2 className="text-3xl md:text-4xl font-bold">
              Why Choose <span className="text-gradient">VR Robotics Academy?</span>
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {whyChoose.map((w) => (
              <Card key={w.title} className="card-ngo border-0">
                <CardHeader className="space-y-3">
                  <div className="w-12 h-12 rounded-lg bg-gradient-hero flex items-center justify-center">
                    <w.icon className="w-6 h-6 text-white" />
                  </div>
                  <CardTitle className="text-lg">{w.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="leading-relaxed">{w.desc}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── Admission Process ───────────── */}
      <section id="admission" className="section-padding">
        <div className="container-ngo">
          <div className="text-center space-y-3 mb-14">
            <p className="text-primary font-semibold">Admission Process</p>
            <h2 className="text-3xl md:text-4xl font-bold">Getting started is easy</h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">
            {admissionSteps.map((s, i) => (
              <div key={s.title} className="text-center space-y-3">
                <div className="relative mx-auto w-16 h-16 rounded-2xl bg-gradient-hero flex items-center justify-center">
                  <s.icon className="w-7 h-7 text-white" />
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-orange-200 text-primary text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                </div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── Certificates ───────────── */}
      <section id="certs" className="section-padding bg-gradient-subtle">
        <div className="container-ngo">
          <div className="text-center space-y-3 mb-14">
            <p className="text-primary font-semibold">Certificates</p>
            <h2 className="text-3xl md:text-4xl font-bold">Certificates our students earn</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {certificates.map((c) => (
              <Card key={c.tier} className="card-ngo border-0 text-center">
                <CardContent className="p-6 space-y-3">
                  <Award className="w-10 h-10 text-primary mx-auto" />
                  <CardTitle className="text-lg">{c.tier}</CardTitle>
                  <CardDescription className="leading-relaxed">{c.desc}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── Student Projects ───────────── */}
      <section id="projects" className="section-padding">
        <div className="container-ngo">
          <div className="text-center space-y-3 mb-14">
            <p className="text-primary font-semibold">Student Projects</p>
            <h2 className="text-3xl md:text-4xl font-bold">
              {projectItems.length > 0 ? "Let's explore creativity" : "What our students build"}
            </h2>
          </div>
          {projectItems.length > 0 ? (
            // Admin-managed projects (image + date + title + author).
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {projectItems.map((p) => {
                const card = (
                  <Card className="card-ngo group border-0 overflow-hidden flex flex-col h-full">
                    <div className="h-48 overflow-hidden bg-muted">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-orange-500 to-rose-600 flex items-center justify-center">
                          <Bot className="w-14 h-14 text-white/90" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-5 space-y-1.5 flex-1">
                      {p.project_date && (
                        <p className="text-primary text-xs font-bold uppercase tracking-wide">{formatGalleryDate(p.project_date)}</p>
                      )}
                      <h3 className="font-semibold text-lg leading-snug">{p.title}</h3>
                      {p.description && <p className="text-muted-foreground text-sm line-clamp-2">{p.description}</p>}
                      {p.author_name && (
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground pt-1">
                          <Users className="w-4 h-4 text-primary" /> {p.author_name}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
                return p.link_url ? (
                  <a key={p.id} href={p.link_url} target="_blank" rel="noopener noreferrer" className="block h-full">{card}</a>
                ) : (
                  <div key={p.id} className="h-full">{card}</div>
                );
              })}
            </div>
          ) : (
            // No hardcoded placeholders — projects come from the admin panel.
            <p className="text-center text-muted-foreground">Student projects will be showcased here soon.</p>
          )}
        </div>
      </section>

      {/* ───────────── Testimonials ───────────── */}
      {testimonials.length > 0 && (
        <section id="testimonials" className="section-padding bg-gradient-subtle">
          <div className="container-ngo">
            <div className="text-center space-y-3 mb-14">
              <p className="text-primary font-semibold">Testimonials</p>
              <h2 className="text-3xl md:text-4xl font-bold">
                What parents &amp; students <span className="text-gradient">have to say</span>
              </h2>
            </div>

            <div className="relative">
              <div className="overflow-hidden py-4">
                <div
                  className="flex items-center transition-transform duration-500 ease-out"
                  style={{ transform: `translateX(${50 - tCardW * (tIndex + 0.5)}%)` }}
                >
                  {testimonials.map((t, idx) => {
                    const active = idx === tIndex;
                    return (
                      <div
                        key={t.id}
                        className="shrink-0 px-3 transition-all duration-500"
                        style={{
                          flex: `0 0 ${tCardW}%`,
                          maxWidth: `${tCardW}%`,
                          opacity: active ? 1 : 0.35,
                          transform: active ? "scale(1)" : "scale(0.88)",
                        }}
                        aria-hidden={!active}
                      >
                        <Card className={`card-ngo-static border-0 flex flex-col h-full ${active ? "shadow-xl" : ""}`}>
                          <CardContent className="p-6 md:p-8 flex flex-col flex-1 items-center text-center">
                            <Quote className="w-8 h-8 text-primary/30 mb-3" />
                            <p className="text-muted-foreground text-sm md:text-base leading-relaxed flex-1">{t.message}</p>
                            <div className="flex items-center gap-3 mt-6 pt-4">
                              <img
                                src={t.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(t.author_name)}&background=FF6A00&color=fff`}
                                alt={t.author_name}
                                className="w-12 h-12 rounded-full object-cover"
                                loading="lazy"
                              />
                              <div className="text-left">
                                <p className="font-semibold text-sm">{t.author_name}</p>
                                {t.role && <p className="text-xs text-muted-foreground">{t.role}</p>}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              </div>

              {tShowArrows && (
                <>
                  <button
                    type="button"
                    onClick={() => setTIndex((i) => Math.max(0, i - 1))}
                    disabled={tIndex === 0}
                    aria-label="Previous testimonial"
                    className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-11 h-11 rounded-full bg-background/70 backdrop-blur shadow-md text-foreground/70 hover:bg-background hover:text-foreground transition disabled:opacity-25 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTIndex((i) => Math.min(tMaxIndex, i + 1))}
                    disabled={tIndex >= tMaxIndex}
                    aria-label="Next testimonial"
                    className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-11 h-11 rounded-full bg-background/70 backdrop-blur shadow-md text-foreground/70 hover:bg-background hover:text-foreground transition disabled:opacity-25 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {tShowArrows && (
              <div className="flex items-center justify-center gap-2 mt-8">
                {testimonials.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setTIndex(idx)}
                    aria-label={`Go to testimonial ${idx + 1}`}
                    className={`h-2 rounded-full transition-all ${idx === tIndex ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"}`}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ───────────── Gallery preview ───────────── */}
      {gallery.length > 0 && (
        <section id="gallery" className="section-padding bg-gradient-subtle">
          <div className="container-ngo">
            <div className="text-center space-y-3 mb-14">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold uppercase tracking-wide text-primary">
                <Images className="w-4 h-4" />
                Gallery
              </span>
              <h2 className="text-3xl md:text-4xl font-bold">
                Moments from our <span className="text-gradient">academy</span>
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                A glimpse of our events, competitions, and classrooms.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {gallery.map((it) => {
                const date = formatGalleryDate(it.event_date);
                const isVideo = it.media_type === "video";
                return (
                  <article key={it.id} className="card-ngo group border-0 flex flex-col overflow-hidden">
                    <div className="relative overflow-hidden">
                      {it.media_url ? (
                        isVideo ? (
                          <iframe title={it.title} src={it.media_url} className="w-full h-52" allowFullScreen />
                        ) : (
                          <img
                            src={it.media_url}
                            alt={it.title}
                            className="w-full h-52 object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                        )
                      ) : (
                        <div className="flex h-52 items-center justify-center bg-gradient-to-br from-orange-100 to-orange-50 text-primary">
                          <ImageIcon className="w-10 h-10 opacity-70" />
                        </div>
                      )}
                      {!isVideo && (
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                      {isVideo && (
                        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white shadow-sm">
                          <PlayCircle className="w-3.5 h-3.5" /> Video
                        </span>
                      )}
                      {!isVideo && date && (
                        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/85 backdrop-blur px-3 py-1 text-xs font-semibold text-primary shadow-sm">
                          <Calendar className="w-3.5 h-3.5" /> {date}
                        </span>
                      )}
                    </div>
                    <div className="p-5 space-y-1.5 flex-1">
                      <h3 className="font-semibold text-lg leading-snug group-hover:text-primary transition-colors">
                        {it.title}
                      </h3>
                      {it.description && (
                        <p className="text-muted-foreground text-sm line-clamp-2">{it.description}</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="text-center mt-12">
              <Button size="lg" className="bg-gradient-hero border-0 text-lg px-8" asChild>
                <Link to="/gallery">
                  View Full Gallery <ArrowRight className="w-5 h-5 ml-1" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ───────────── CTA / Book Demo ───────────── */}
      <section id="contact" className="section-padding pt-0">
        <div className="container-ngo">
          <div className="rounded-3xl bg-gradient-hero text-white p-10 md:p-16 text-center space-y-6">
            <Quote className="w-10 h-10 mx-auto opacity-80" />
            <h2 className="text-3xl md:text-4xl font-bold">
              Ready to build young innovators?
            </h2>
            <p className="text-white/90 max-w-2xl mx-auto">
              Book a 30-minute demo session — your child can experience our VR
              robotics platform, meet our teachers, and ask questions.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" variant="secondary" className="text-lg px-8" onClick={() => setDemoOpen(true)}>
                Book Demo
              </Button>
              <Button size="lg" variant="secondary" className="text-lg px-8 bg-white text-foreground hover:bg-white/90" asChild>
                <Link to="/contact">Contact Us</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────── Book Demo modal (backup flow) ───────────── */}
      {demoOpen && <BookDemoModal mode="paid" onClose={() => setDemoOpen(false)} />}
    </div>
  );
};

export default Home;

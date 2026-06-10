import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Search,
  MapPin,
  ImageIcon,
  Wrench,
  Rocket,
  Users,
  BadgeCheck,
  Laptop,
  Briefcase,
} from "lucide-react";

/**
 * VR Robotics Academy — Locations page. The learning-center cards are now
 * admin-managed (Admin → Marketing → Locations) and loaded from
 * GET /api/public/locations. Centre photos are optional; cards without a photo
 * show a coloured placeholder. The hero, map and "Why Join" sections are static.
 */

const ADMIN_BASE =
  (import.meta.env.VITE_ADMIN_API_URL as string) || "http://localhost:5000";

interface Center {
  id: number;
  name: string;
  city: string | null;
  state: string | null;
  pin: string | null;
  photo_url: string | null;
  map_url: string | null;
  is_new: number;
}

// Card header gradients, cycled by card index so the page keeps its colourful
// look without the admin having to pick a colour per centre.
const TINTS = [
  "from-emerald-500 to-teal-700",
  "from-indigo-500 to-blue-700",
  "from-violet-500 to-purple-700",
  "from-rose-500 to-red-700",
  "from-amber-500 to-orange-700",
  "from-sky-500 to-cyan-700",
];

// Full "City, State" line for a centre (omits missing parts cleanly).
const addressLine = (c: Center) => [c.city, c.state].filter(Boolean).join(", ");

const Placeholder = ({ label, tint = "from-orange-400 to-orange-600", className = "" }: { label: string; tint?: string; className?: string }) => (
  <div className={`relative flex items-center justify-center bg-gradient-to-br ${tint} text-white ${className}`}>
    <div className="flex flex-col items-center gap-1 opacity-90">
      <ImageIcon className="w-8 h-8" />
      <span className="text-xs font-medium">{label}</span>
    </div>
    <span className="absolute top-2 right-2 text-[10px] bg-black/30 px-1.5 py-0.5 rounded">Centre photo</span>
  </div>
);

const whyJoin = [
  { icon: Wrench, color: "text-orange-500", title: "Hands-On Learning", text: "Gain real-world experience with Robotics, AI, and Coding projects designed to build practical tech skills and confidence." },
  { icon: Rocket, color: "text-orange-500", title: "Future-Ready Skills", text: "Learn the most in-demand technologies — Artificial Intelligence, Machine Learning, and IoT — to stay ahead in today's digital world." },
  { icon: Users, color: "text-emerald-500", title: "Expert Mentorship", text: "Get guided by industry professionals and certified trainers who help you understand, apply, and grow your technical knowledge." },
  { icon: BadgeCheck, color: "text-sky-500", title: "Recognized Certification", text: "Earn industry-recognized certificates that highlight your expertise and strengthen your resume for future opportunities." },
  { icon: Laptop, color: "text-pink-500", title: "Interactive Learning", text: "Join live, interactive online classes and collaborate on team projects that improve creativity, logic, and problem-solving." },
  { icon: Briefcase, color: "text-purple-500", title: "Career Boost", text: "Prepare for exciting roles in AI, Robotics, Coding, and STEM-based careers with real skills and professional exposure." },
];

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

const Locations = () => {
  const [query, setQuery] = useState("");
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${ADMIN_BASE}/api/public/locations`, { timeout: 20000 })
      .then(({ data }) => {
        if (!cancelled) setCenters(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setCenters([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Filter by the hero search box (name / city / state / PIN).
  const q = query.trim().toLowerCase();
  const shown = q
    ? centers.filter((c) =>
        [c.name, c.city, c.state, c.pin]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    : centers;

  return (
    <div className="overflow-hidden">
      {/* Hero + search */}
      <section className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
        <div className="container-ngo py-16 text-center space-y-5">
          <h1 className="text-4xl md:text-5xl font-bold">Advanced Robotics Learning Centers</h1>
          <p className="text-white/90">Unlock your potential with VR Robotics Academy's robotics, AI & coding learning centers.</p>
          <form className="max-w-2xl mx-auto flex gap-2" onSubmit={(e) => e.preventDefault()}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by pin code, area, or city"
              className="flex-1 rounded-lg px-4 py-3 text-foreground outline-none"
            />
            <Button type="submit" className="bg-gradient-hero border-0 px-6">
              <Search className="w-5 h-5" />
            </Button>
          </form>
        </div>
      </section>

      {/* Centers */}
      <section className="section-padding">
        <div className="container-ngo">
          {loading ? (
            <p className="text-center text-muted-foreground py-10">Loading centers…</p>
          ) : shown.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">
              {centers.length === 0
                ? "No learning centers listed yet."
                : "No centers match your search."}
            </p>
          ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {shown.map((c, i) => (
              <Card key={c.id} className="card-ngo border-0 overflow-hidden">
                <div className="relative">
                  {c.photo_url ? (
                    <img src={c.photo_url} alt={c.name} className="h-44 w-full object-cover" />
                  ) : (
                    <Placeholder label="Centre photo" tint={TINTS[i % TINTS.length]} className="h-44" />
                  )}
                  {!!c.is_new && (
                    <span className="absolute top-0 left-0 bg-primary text-white text-xs font-bold px-6 py-1 rotate-[-30deg] -translate-x-5 translate-y-3">
                      New
                    </span>
                  )}
                </div>
                <CardContent className="p-5 space-y-2">
                  <h3 className="font-semibold text-lg">{c.name}</h3>
                  <p className="flex items-center gap-2 text-muted-foreground text-sm">
                    <MapPin className="w-4 h-4 text-warm-green" /> {addressLine(c) || "—"}
                  </p>
                  {c.pin && <p className="text-muted-foreground text-sm">PIN: {c.pin}</p>}
                  <div className="flex gap-3 pt-2">
                    <Button size="sm" className="bg-warm-green border-0 text-white" asChild>
                      <Link to="/contact">Know More</Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={c.map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          `VR Robotics Academy ${addressLine(c) || c.name}`,
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View on Map
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          )}
        </div>
      </section>

      {/* Find us on the map */}
      <section className="section-padding pt-0">
        <div className="container-ngo">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-8">Find us on the map</h2>
          {MAPS_KEY ? (
            <iframe
              title="VR Robotics Academy — Guntur HQ"
              src={`https://www.google.com/maps/embed/v1/place?key=${MAPS_KEY}&q=${encodeURIComponent(
                "VR Robotics Academy, Guntur, Andhra Pradesh",
              )}`}
              className="w-full h-[420px] rounded-2xl border border-orange-100 shadow-card"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          ) : (
            <div className="rounded-2xl border border-orange-100 h-[420px] flex items-center justify-center text-muted-foreground">
              Set VITE_GOOGLE_MAPS_API_KEY in .env to show the map.
            </div>
          )}
        </div>
      </section>

      {/* Why Join VR Robotics? */}
      <section className="section-padding bg-gradient-subtle">
        <div className="container-ngo">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-14">
            Why Join <span className="text-gradient">VR Robotics?</span>
          </h2>
          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {whyJoin.map((w) => (
              <Card key={w.title} className="card-ngo border-0">
                <CardContent className="p-7 flex gap-5">
                  <w.icon className={`w-10 h-10 shrink-0 ${w.color}`} />
                  <div>
                    <h3 className="text-xl font-bold mb-2">{w.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{w.text}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 text-warm-green font-semibold hover:underline"
            >
              → Ready to Transform Your Future? Join VR Robotics Today
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Locations;

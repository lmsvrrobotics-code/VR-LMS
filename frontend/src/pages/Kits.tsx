import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart, Package, ImageIcon, BookOpen, Zap } from "lucide-react";
import * as bookOrderApi from "@/api/bookOrderApi";

const ADMIN_BASE =
  (import.meta.env.VITE_ADMIN_API_URL as string) || "http://localhost:5000";

interface Kit {
  id: number;
  title: string;
  subtitle: string | null;
  description: string | null;
  cover_url: string | null;
  buy_url: string | null;
  price: number;
}

const TINTS = [
  "from-orange-500 to-rose-600",
  "from-pink-500 to-red-600",
  "from-amber-500 to-orange-600",
  "from-yellow-500 to-amber-600",
];

const Placeholder = ({
  label,
  tint = "from-orange-500 to-rose-600",
  className = "",
}: {
  label: string;
  tint?: string;
  className?: string;
}) => (
  <div
    className={`relative flex items-center justify-center bg-gradient-to-br ${tint} text-white ${className}`}
  >
    <div className="flex flex-col items-center gap-1 opacity-90">
      <ImageIcon className="w-8 h-8" />
      <span className="text-xs font-medium text-center px-2">{label}</span>
    </div>
  </div>
);

const Kits = () => {
  const [kits, setKits] = useState<Kit[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${ADMIN_BASE}/api/public/kits`, {
          timeout: 30000,
          params: { t: Date.now() },
          headers: { "Cache-Control": "no-cache" },
        });
        if (!cancelled) {
          setKits(Array.isArray(res.data) ? res.data : []);
          console.log("Kits loaded:", res.data);
        }
      } catch (err) {
        console.error("Failed to load kits:", err);
        if (!cancelled) {
          setKits([]);
          setMessage({ type: "error", text: "Failed to load kits. Please refresh." });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBuy = async (kit: Kit) => {
    try {
      setPaying(kit.id);
      setMessage(null);
      const userData = {
        name: localStorage.getItem("userName") || "Student",
        email: localStorage.getItem("userEmail") || "",
        phone: localStorage.getItem("userPhone") || "",
      };
      await bookOrderApi.buyKit(kit.id, userData, () => {
        setMessage({ type: "success", text: "🚀 Kit order confirmed! Check your email for details." });
        setPaying(null);
      }, (msg) => {
        setMessage({ type: "error", text: msg });
        setPaying(null);
      });
    } catch (err) {
      console.error("Payment error:", err);
      setMessage({ type: "error", text: "Failed to process payment" });
      setPaying(null);
    }
  };

  const featured = kits[0];

  return (
    <div className="overflow-hidden">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-orange-50 via-white to-rose-50 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5" style={{backgroundImage: 'linear-gradient(90deg, rgba(0,0,0,.05) 1px, transparent 1px), linear-gradient(rgba(0,0,0,.05) 1px, transparent 1px)', backgroundSize: '50px 50px'}} />
        <div className="container-ngo grid lg:grid-cols-2 gap-10 items-center py-16 lg:py-28 relative z-10">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-100 w-fit">
              <Zap className="w-4 h-4 text-orange-600" />
              <span className="text-orange-600 font-semibold text-sm">Hands-On Learning</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold leading-tight">
              Build & Learn with <span className="text-orange-600">Robotics Kits</span>
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Get our complete robotics kits packed with everything you need to build amazing projects and master robotics hands-on.
            </p>
            <div className="flex gap-4 pt-6">
              <Link to="/books">
                <Button variant="outline" size="lg">
                  <BookOpen className="w-5 h-5 mr-2" />
                  Read Our Books ←
                </Button>
              </Link>
            </div>
          </div>
          {featured?.cover_url ? (
            <img
              src={featured.cover_url}
              alt={featured.title}
              className="rounded-3xl aspect-[4/3] w-full object-cover shadow-2xl hover:shadow-3xl transition-shadow"
            />
          ) : (
            <Placeholder
              label="Featured Kit Cover"
              className="rounded-3xl aspect-[4/3]"
            />
          )}
        </div>
      </section>

      {/* Content Section */}
      <section className="section-padding">
        <div className="container-ngo">
          {/* Alert Message */}
          {message && (
            <div className={`mb-8 p-5 rounded-lg border-l-4 ${
              message.type === "success"
                ? "bg-green-50 border-green-400 text-green-800"
                : "bg-red-50 border-red-400 text-red-800"
            }`}>
              {message.text}
            </div>
          )}

          {/* Header */}
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Robotics Kits</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Complete kits designed for learners of all levels to start building real robots
            </p>
          </div>

          {/* Loading State */}
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col rounded-2xl overflow-hidden border border-border/50 bg-white">
                  <Skeleton className="w-full aspect-video" />
                  <div className="p-5 flex flex-col flex-1 space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-full" />
                    <div className="flex-1" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : kits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 rounded-3xl bg-orange-100 flex items-center justify-center mb-6">
                <Package className="w-10 h-10 text-orange-600" />
              </div>
              <h3 className="text-2xl font-semibold mb-2">Kits Coming Soon</h3>
              <p className="text-muted-foreground text-lg mb-8 max-w-md">
                We're preparing amazing robotics kits for you. Check back soon!
              </p>
              <Button variant="outline" asChild>
                <Link to="/">Back to Home</Link>
              </Button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {kits.map((kit, i) => (
                <article
                  key={kit.id}
                  className="group relative flex flex-col h-full rounded-2xl overflow-hidden bg-white border border-border/50 hover:border-orange-500/50 shadow-md hover:shadow-xl transition-all duration-300"
                >
                  {/* Cover Image - Top */}
                  <div className="relative w-full aspect-video overflow-hidden bg-gradient-to-br from-orange-100 to-rose-100">
                    {kit.cover_url ? (
                      <img
                        src={kit.cover_url}
                        alt={kit.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        loading="lazy"
                      />
                    ) : (
                      <Placeholder
                        label="Kit"
                        tint={TINTS[i % TINTS.length]}
                        className="w-full h-full"
                      />
                    )}
                    {kit.price > 0 && (
                      <div className="absolute top-3 right-3 bg-orange-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold">
                        ₹{kit.price}
                      </div>
                    )}
                  </div>

                  {/* Content - Bottom */}
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="font-bold text-lg leading-snug line-clamp-2 group-hover:text-orange-600 transition-colors mb-1">
                      {kit.title}
                    </h3>
                    {kit.subtitle && (
                      <p className="text-orange-600 text-sm font-medium mb-2 line-clamp-1">
                        {kit.subtitle}
                      </p>
                    )}
                    {kit.description && (
                      <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2 mb-4">
                        {kit.description}
                      </p>
                    )}

                    <div className="flex-1" />

                    {/* Buy Button */}
                    <Button
                      className="w-full bg-orange-600 hover:bg-orange-700 border-0 font-semibold"
                      onClick={() => handleBuy(kit)}
                      disabled={paying === kit.id || kit.price <= 0}
                    >
                      {paying === kit.id ? (
                        <>⏳ Processing...</>
                      ) : (
                        <>
                          <ShoppingCart className="w-4 h-4 mr-2" />
                          Get Kit Now
                        </>
                      )}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      {kits.length > 0 && (
        <section className="bg-gradient-to-r from-orange-600 to-rose-600 text-white py-16">
          <div className="container-ngo text-center space-y-6">
            <h2 className="text-3xl md:text-4xl font-bold">Complete Your Learning Journey</h2>
            <p className="text-lg opacity-95 max-w-2xl mx-auto">
              Pair our kits with comprehensive books and tutorials for the ultimate robotics education
            </p>
            <Link to="/books">
              <Button size="lg" variant="secondary" className="font-semibold">
                <BookOpen className="w-5 h-5 mr-2" />
                Explore Books
              </Button>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
};

export default Kits;

import { useEffect, useState } from "react";
import axios from "axios";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart, BookOpen, ImageIcon, Package } from "lucide-react";
import * as bookOrderApi from "@/api/bookOrderApi";

/**
 * VR Robotics Academy — public Books & Kits page (Home → Books).
 * Live data from admin-service: GET /api/public/books and GET /api/public/kits.
 * Admins add/manage these under Admin → Books → Add/Manage Books/Kits.
 * Students can purchase books and kits directly via Razorpay payment integration.
 */

const ADMIN_BASE =
  (import.meta.env.VITE_ADMIN_API_URL as string) || "http://localhost:5000";

interface Book {
  id: number;
  title: string;
  subtitle: string | null;
  description: string | null;
  cover_url: string | null;
  buy_url: string | null;
  price: number;
}

interface Kit {
  id: number;
  title: string;
  subtitle: string | null;
  description: string | null;
  cover_url: string | null;
  price: number;
}

const TINTS = [
  "from-blue-500 to-indigo-700",
  "from-violet-500 to-purple-700",
  "from-teal-500 to-emerald-700",
  "from-orange-500 to-rose-600",
];

const Placeholder = ({
  label,
  tint = "from-blue-500 to-indigo-700",
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

const Books = () => {
  const [searchParams] = useSearchParams();
  const [books, setBooks] = useState<Book[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"books" | "kits">(
    searchParams.get("tab") === "kits" ? "kits" : "books"
  );
  const [paying, setPaying] = useState<{ type: "book" | "kit"; id: number } | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [booksRes, kitsRes] = await Promise.all([
          axios.get(`${ADMIN_BASE}/api/public/books`, {
            timeout: 30000,
            params: { t: Date.now() },
            headers: { "Cache-Control": "no-cache" },
          }),
          axios.get(`${ADMIN_BASE}/api/public/kits`, {
            timeout: 30000,
            params: { t: Date.now() },
            headers: { "Cache-Control": "no-cache" },
          }),
        ]);
        if (!cancelled) {
          setBooks(Array.isArray(booksRes.data) ? booksRes.data : []);
          setKits(Array.isArray(kitsRes.data) ? kitsRes.data : []);
        }
      } catch {
        if (!cancelled) {
          setBooks([]);
          setKits([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBuyBook = async (book: Book) => {
    try {
      setPaying({ type: "book", id: book.id });
      setMessage(null);
      const userData = {
        name: localStorage.getItem("userName") || "Student",
        email: localStorage.getItem("userEmail") || "",
        phone: localStorage.getItem("userPhone") || "",
      };
      await bookOrderApi.buyBook(book.id, userData, () => {
        setMessage({ type: "success", text: "Book order confirmed! Check your email for details." });
        setPaying(null);
      }, (msg) => {
        setMessage({ type: "error", text: msg });
        setPaying(null);
      });
    } catch (err) {
      setMessage({ type: "error", text: "Failed to process payment" });
      setPaying(null);
    }
  };

  const handleBuyKit = async (kit: Kit) => {
    try {
      setPaying({ type: "kit", id: kit.id });
      setMessage(null);
      const userData = {
        name: localStorage.getItem("userName") || "Student",
        email: localStorage.getItem("userEmail") || "",
        phone: localStorage.getItem("userPhone") || "",
      };
      await bookOrderApi.buyKit(kit.id, userData, () => {
        setMessage({ type: "success", text: "Kit order confirmed! Check your email for details." });
        setPaying(null);
      }, (msg) => {
        setMessage({ type: "error", text: msg });
        setPaying(null);
      });
    } catch (err) {
      setMessage({ type: "error", text: "Failed to process payment" });
      setPaying(null);
    }
  };

  const featured = activeTab === "books" ? books[0] : kits[0];
  const itemsList = activeTab === "books" ? books : kits;

  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="bg-gradient-subtle">
        <div className="container-ngo grid lg:grid-cols-2 gap-10 items-center py-16 lg:py-24">
          <div className="space-y-6">
            <p className="text-primary font-semibold uppercase tracking-wide text-sm">
              VR Robotics Academy {activeTab === "books" ? "Books" : "Kits"}
            </p>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              Master the <span className="text-gradient">Ultimate Skill</span> of
              the 21st Century
            </h1>
            <p className="text-lg text-muted-foreground">
              {activeTab === "books"
                ? "Enhance your robotics knowledge with our comprehensive books and guides."
                : "Build and innovate with our premium robotics kits designed for all levels."}
            </p>
          </div>
          {featured?.cover_url ? (
            <img
              src={featured.cover_url}
              alt={featured.title}
              className="rounded-3xl aspect-[4/3] w-full object-cover shadow-card"
            />
          ) : (
            <Placeholder
              label={`Featured ${activeTab === "books" ? "book" : "kit"} cover`}
              className="rounded-3xl aspect-[4/3]"
            />
          )}
        </div>
      </section>

      {/* Tabs + List */}
      <section className="section-padding">
        <div className="container-ngo">
          {/* Tabs */}
          <div className="flex gap-4 mb-12 border-b">
            <button
              onClick={() => setActiveTab("books")}
              className={`pb-4 px-1 font-semibold transition-colors ${
                activeTab === "books"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BookOpen className="w-5 h-5 inline mr-2" />
              Books
            </button>
            <button
              onClick={() => setActiveTab("kits")}
              className={`pb-4 px-1 font-semibold transition-colors ${
                activeTab === "kits"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Package className="w-5 h-5 inline mr-2" />
              Kits
            </button>
          </div>

          {/* Message */}
          {message && (
            <div className={`mb-6 p-4 rounded-lg ${
              message.type === "success"
                ? "bg-green-50 text-green-800"
                : "bg-red-50 text-red-800"
            }`}>
              {message.text}
            </div>
          )}

          <h2 className="text-3xl md:text-4xl font-bold text-center mb-14">
            Our {activeTab === "books" ? "Books" : "Kits"}
          </h2>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card-ngo border-0 overflow-hidden">
                  <Skeleton className="w-full aspect-[3/4]" />
                  <div className="p-6 space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-1/3 mb-4" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : itemsList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                {activeTab === "books" ? (
                  <BookOpen className="w-8 h-8 text-primary" />
                ) : (
                  <Package className="w-8 h-8 text-primary" />
                )}
              </div>
              <h3 className="text-lg font-semibold">{emptyLabel} coming soon</h3>
              <p className="text-muted-foreground text-sm mt-1">
                New {activeTab === "books" ? "titles" : "kits"} from VR Robotics Academy will appear here.
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {itemsList.map((item, i) => (
                <article
                  key={item.id}
                  className="card-ngo-static border-0 rounded-2xl overflow-hidden flex flex-col h-full group transition-transform duration-300 hover:-translate-y-1 scroll-mt-28"
                >
                  <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                    {item.cover_url ? (
                      <img
                        src={item.cover_url}
                        alt={item.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <Placeholder
                        label={`${activeTab === "books" ? "Book" : "Kit"} cover`}
                        tint={TINTS[i % TINTS.length]}
                        className="w-full h-full"
                      />
                    )}
                  </div>

                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="font-bold text-lg leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                      {item.title}
                    </h3>
                    {item.subtitle && (
                      <p className="text-primary/90 text-sm font-medium mt-1 line-clamp-1">
                        {item.subtitle}
                      </p>
                    )}
                    {item.description && (
                      <p className="text-muted-foreground text-sm mt-2 leading-relaxed line-clamp-2">
                        {item.description}
                      </p>
                    )}
                    {/* Price display */}
                    {item.price > 0 && (
                      <div className="mt-3 text-lg font-bold text-primary">
                        ₹{item.price.toFixed(2)}
                      </div>
                    )}
                    <div className="flex-1" />
                    <Button
                      className="mt-4 w-full bg-gradient-hero border-0"
                      onClick={() =>
                        activeTab === "books"
                          ? handleBuyBook(item as Book)
                          : handleBuyKit(item as Kit)
                      }
                      disabled={
                        paying?.id === item.id || item.price <= 0
                      }
                    >
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      {paying?.id === item.id ? "Processing..." : "Buy Now"}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default Books;

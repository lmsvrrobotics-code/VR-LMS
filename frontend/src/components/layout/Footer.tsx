import { Link } from "react-router-dom";
import {
  MapPin,
  Phone,
  Mail,
  Sparkles,
  FacebookIcon,
  InstagramIcon,
  YoutubeIcon,
} from "lucide-react";

const explore = [
  { name: "Home", href: "/" },
  { name: "About Us", href: "/about" },
  { name: "Curriculum", href: "/#curriculum" },
  { name: "Certificates", href: "/#certs" },
  { name: "Why VR Robotics", href: "/#why" },
  { name: "What Kids Learn", href: "/#curriculum" },
];

const scrollTo = (href: string) => {
  const hash = href.split("#")[1];
  if (hash) {
    const el = document.getElementById(hash);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      return;
    }
  }
  window.scrollTo({ top: 0, behavior: "instant" });
};

const Footer = () => {
  return (
    <footer className="bg-[#13131f] text-white/80">
      <div className="container-ngo">
        <div className="py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {/* Brand / about */}
          <div className="space-y-5">
            <Link to="/" className="font-heading text-2xl font-extrabold tracking-tight block">
              <span className="text-gradient">VR</span>{" "}
              <span className="text-white">Robotics Academy</span>
            </Link>
            <p className="leading-relaxed">
              Empowering the next generation of innovators through robotics,
              coding, and VR education. Building young innovators through
              hands-on technology learning.
            </p>
            <div className="flex items-center gap-2 text-sm text-primary">
              <Sparkles className="w-4 h-4" /> Live in Future
            </div>
            <div className="flex items-center gap-4 pt-1">
              <a href="https://www.facebook.com/61580082415242/" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors"><FacebookIcon className="w-5 h-5" /></a>
              <a href="https://www.youtube.com/@VRRobotics/videos" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors"><YoutubeIcon className="w-5 h-5" /></a>
              <a href="https://www.instagram.com/vr_robotics_academy?igsh=MTJnb2NhcXp0N29yeg==" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors"><InstagramIcon className="w-5 h-5" /></a>
            </div>
          </div>

          {/* Explore */}
          <div>
            <h3 className="font-semibold text-white mb-5">Explore</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {explore.map((l) => (
                <Link
                  key={l.name}
                  to={l.href.startsWith("/#") ? "/" : l.href}
                  onClick={() => scrollTo(l.href)}
                  className="hover:text-primary transition-colors"
                >
                  {l.name}
                </Link>
              ))}
            </div>
          </div>

          {/* Get in touch */}
          <div className="space-y-4">
            <h3 className="font-semibold text-white">Get in Touch</h3>
            <a href="mailto:vrroboticsacademy@gmail.com" className="flex items-center gap-3 hover:text-primary transition-colors">
              <Mail className="w-5 h-5 text-primary shrink-0" />
              vrroboticsacademy@gmail.com
            </a>
            <a href="tel:+919182363638" className="flex items-center gap-3 hover:text-primary transition-colors">
              <Phone className="w-5 h-5 text-primary shrink-0" />
              +91 91823 63638
            </a>
            <p className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              Andhra Pradesh, India
            </p>
          </div>
        </div>

        <div className="py-6 border-t border-white/10 text-center text-sm text-white/60">
          © {new Date().getFullYear()} VR Robotics Academy. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
